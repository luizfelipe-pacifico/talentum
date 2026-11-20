/* Pontos de restauração: cópia verificada do banco local, num arquivo próprio.

   Um ponto de restauração é um trio de arquivos na pasta de backups, nomeados
   pelo UUID do ponto:

   - `<id>.sqlite` — cópia consistente do banco, cifrada com a chave do banco;
   - `<id>.key`    — cópia da chave do dispositivo, quando existe. Sem ela, as
                      chaves PIX gravadas na cópia ficariam ilegíveis depois de
                      restaurar (docs/decisions/0003-local-device-key.md);
   - `<id>.json`   — manifesto: tipo, instante, versão do schema e SHA-256.

   O manifesto mora no disco, e não só no banco, por um motivo concreto: ao
   restaurar uma cópia antiga, o banco volta a um momento em que os pontos
   posteriores não existiam. Se a lista morasse só dentro dele, restaurar
   apagaria da tela o ponto que permite desfazer a própria restauração. A tabela
   `DatabaseBackup` é o índice dentro do banco, sincronizado a partir do disco.

   A troca do banco ativo não acontece com o aplicativo aberto: o Prisma mantém
   o arquivo aberto, e no Windows nem é possível substituí-lo. Restaurar
   **agenda** a troca (`pending-restore.*`), que o desbloqueio seguinte do cofre
   aplica antes de abrir o banco e de aplicar as migrations
   (src/server/backup/startup.ts).

   Toda leitura do conteúdo do banco passa por `DatabaseFileAdapter`; o
   aplicativo usa `encryptedFileAdapter` (libsql-file.ts), que copia e abre o
   arquivo com a chave do banco: um ponto de restauração é cifrado como o banco
   e nunca fica em claro no disco. Este módulo só copia, renomeia e confere o
   SHA-256 dos **bytes** do arquivo. Caminhos vêm de `node:path`, sem
   suposição de sistema: valem no Windows, Linux e macOS.

   Sem imports de alias, para o executor de testes do Node importar este
   módulo direto. */

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { pendingRestoreFiles, restorePointFile, isRestorePointId } from './paths.ts';

export const RESTORE_POINT_KINDS = ['manual', 'pre_migration', 'pre_restore', 'pre_deletion'] as const;
export type RestorePointKind = (typeof RESTORE_POINT_KINDS)[number];

/** Limite de pontos guardados. Ao passar dele, saem primeiro os automáticos mais antigos. */
export const MAX_RESTORE_POINTS = 20;

/**
 * Ponto único de acesso ao conteúdo do banco: cópia consistente e
 * `PRAGMA quick_check`, com a chave do banco em memória (libsql-file.ts).
 */
export type DatabaseFileAdapter = {
  /** Grava em `destination` uma cópia consistente do banco ativo. */
  snapshot(destination: string): Promise<void>;
  /** Integridade do arquivo e migrations aplicadas nele, em ordem. */
  inspect(file: string): Promise<{ integrityOk: boolean; migrations: string[] }>;
};

export class RestorePointError extends Error {
  readonly code:
    | 'NOT_FOUND'
    | 'CHECKSUM_MISMATCH'
    | 'INTEGRITY_FAILED'
    | 'SCHEMA_UNKNOWN'
    | 'SNAPSHOT_FAILED'
    | 'IN_USE';
  constructor(code: RestorePointError['code']) {
    super(code);
    this.name = 'RestorePointError';
    this.code = code;
  }
}

const SHA256 = /^[a-f0-9]{64}$/;
const MIGRATION = /^\d{14}_[a-z0-9_]+$/;

const manifestSchema = z
  .object({
    format: z.literal('talentum-restore-point'),
    formatVersion: z.literal(1),
    id: z.string().uuid(),
    kind: z.enum(RESTORE_POINT_KINDS),
    createdAt: z.string().datetime(),
    schemaVersion: z.string().regex(MIGRATION),
    sha256: z.string().regex(SHA256),
    byteSize: z.number().int().positive(),
    keySha256: z.string().regex(SHA256).nullable(),
    idempotencyKey: z.string().uuid().nullable(),
  })
  .strict();

export type RestorePointManifest = z.infer<typeof manifestSchema>;

const pendingSchema = z
  .object({
    format: z.literal('talentum-pending-restore'),
    formatVersion: z.literal(1),
    createdAt: z.string().datetime(),
    source: z.enum(['restore_point', 'encrypted_backup']),
    sourceRestorePointId: z.string().uuid().nullable(),
    safetyRestorePointId: z.string().uuid().nullable(),
    schemaVersion: z.string().regex(MIGRATION),
    sha256: z.string().regex(SHA256),
    byteSize: z.number().int().positive(),
    keySha256: z.string().regex(SHA256).nullable(),
  })
  .strict();

export type PendingRestoreManifest = z.infer<typeof pendingSchema>;

export type RestorePointSummary = RestorePointManifest & { status: 'available' | 'damaged' };

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function sha256Buffer(buffer: Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function restrict(file: string) {
  try {
    await chmod(file, 0o600);
  } catch {
    /* sistema de arquivos sem modo POSIX; vale a ACL da pasta do usuário */
  }
}

/** Grava JSON por arquivo temporário e `rename`: quem lê nunca vê metade. */
async function writeJsonAtomic(file: string, value: unknown) {
  const partial = `${file}.partial`;
  await writeFile(partial, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(partial, file);
}

async function ensureDirectory(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

/**
 * Versões de schema compatíveis: toda migration aplicada na cópia precisa
 * existir no banco atual. Uma cópia feita por versão mais nova do aplicativo,
 * ou por outro programa, é recusada antes de qualquer troca.
 */
export function isSchemaCompatible(snapshotMigrations: string[], currentMigrations: string[]): boolean {
  if (snapshotMigrations.length === 0) return false;
  const known = new Set(currentMigrations);
  return snapshotMigrations.every((name) => known.has(name));
}

export type CreateOptions = {
  dir: string;
  keyPath: string;
  adapter: DatabaseFileAdapter;
  kind: RestorePointKind;
  idempotencyKey?: string | null;
  now?: Date;
};

/** Cria e verifica um ponto de restauração. Em falha, nada fica pela metade. */
export async function createRestorePoint(options: CreateOptions): Promise<RestorePointManifest> {
  await ensureDirectory(options.dir);
  const id = randomUUID();
  const database = restorePointFile(options.dir, id, 'sqlite');
  const key = restorePointFile(options.dir, id, 'key');
  const partial = `${database}.partial`;

  try {
    await options.adapter.snapshot(partial);
    const inspected = await options.adapter.inspect(partial);
    const schemaVersion = inspected.migrations.at(-1);
    if (!inspected.integrityOk || !schemaVersion) throw new RestorePointError('INTEGRITY_FAILED');

    const sha256 = await sha256File(partial);
    const { size } = await stat(partial);
    await rename(partial, database);
    await restrict(database);

    let keySha256: string | null = null;
    if (await exists(options.keyPath)) {
      const material = await readFile(options.keyPath);
      await writeFile(key, material, { mode: 0o600 });
      keySha256 = sha256Buffer(material);
    }

    const manifest: RestorePointManifest = {
      format: 'talentum-restore-point',
      formatVersion: 1,
      id,
      kind: options.kind,
      createdAt: (options.now ?? new Date()).toISOString(),
      schemaVersion,
      sha256,
      byteSize: size,
      keySha256,
      idempotencyKey: options.idempotencyKey ?? null,
    };
    // O manifesto é o último a ser gravado: sem ele, o ponto não aparece.
    await writeJsonAtomic(restorePointFile(options.dir, id, 'json'), manifest);
    return manifest;
  } catch (error) {
    await Promise.all([partial, database, key].map((file) => rm(file, { force: true })));
    if (error instanceof RestorePointError) throw error;
    throw new RestorePointError('SNAPSHOT_FAILED');
  }
}

async function readManifest(file: string): Promise<RestorePointManifest | null> {
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Pontos de restauração no disco, do mais novo para o mais antigo. */
export async function listRestorePoints(dir: string): Promise<RestorePointSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const points: RestorePointSummary[] = [];
  for (const entry of entries) {
    const id = entry.endsWith('.json') ? entry.slice(0, -'.json'.length) : '';
    if (!isRestorePointId(id)) continue;
    const manifest = await readManifest(restorePointFile(dir, id, 'json'));
    // Manifesto que não descreve o próprio arquivo é ignorado, não confiado.
    if (!manifest || manifest.id !== id.toLowerCase()) continue;
    let status: RestorePointSummary['status'] = 'damaged';
    try {
      const { size } = await stat(restorePointFile(dir, id, 'sqlite'));
      if (size === manifest.byteSize) status = 'available';
    } catch {
      /* arquivo ausente: o ponto aparece como danificado, nunca como disponível */
    }
    points.push({ ...manifest, status });
  }
  return points.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
}

/**
 * Confere um ponto antes de usá-lo: SHA-256 da cópia e da chave, integridade
 * do SQLite e versão do schema registrada no manifesto.
 */
export async function verifyRestorePoint(dir: string, id: string, adapter: DatabaseFileAdapter) {
  if (!isRestorePointId(id)) throw new RestorePointError('NOT_FOUND');
  const manifest = await readManifest(restorePointFile(dir, id, 'json'));
  if (!manifest) throw new RestorePointError('NOT_FOUND');

  const database = restorePointFile(dir, id, 'sqlite');
  if (!(await exists(database)) || (await sha256File(database)) !== manifest.sha256) throw new RestorePointError('CHECKSUM_MISMATCH');

  const key = restorePointFile(dir, id, 'key');
  if (manifest.keySha256) {
    if (!(await exists(key)) || sha256Buffer(await readFile(key)) !== manifest.keySha256) throw new RestorePointError('CHECKSUM_MISMATCH');
  }

  const inspected = await adapter.inspect(database);
  if (!inspected.integrityOk || inspected.migrations.at(-1) !== manifest.schemaVersion) throw new RestorePointError('INTEGRITY_FAILED');

  return { manifest, migrations: inspected.migrations, database, key: manifest.keySha256 ? key : null };
}

export async function deleteRestorePoint(dir: string, id: string): Promise<boolean> {
  if (!isRestorePointId(id)) return false;
  const manifest = restorePointFile(dir, id, 'json');
  if (!(await exists(manifest))) return false;
  // Primeiro o manifesto: o ponto some da lista antes dos arquivos.
  await rm(manifest, { force: true });
  await rm(restorePointFile(dir, id, 'sqlite'), { force: true });
  await rm(restorePointFile(dir, id, 'key'), { force: true });
  return true;
}

/** Remove os pontos automáticos mais antigos acima do limite. Os manuais ficam. */
export async function applyRetention(dir: string, max = MAX_RESTORE_POINTS, protect: string[] = []): Promise<string[]> {
  const points = await listRestorePoints(dir);
  const removed: string[] = [];
  let excess = points.length - max;
  for (const point of [...points].reverse()) {
    if (excess <= 0) break;
    if (point.kind === 'manual' || protect.includes(point.id)) continue;
    await deleteRestorePoint(dir, point.id);
    removed.push(point.id);
    excess -= 1;
  }
  return removed;
}

export type StageOptions = {
  dir: string;
  /** Cópia já verificada que vai substituir o banco ativo. */
  database: string;
  key: string | null;
  /** Move o arquivo em vez de copiar (arquivo temporário que já é nosso). */
  move?: boolean;
  source: PendingRestoreManifest['source'];
  sourceRestorePointId: string | null;
  safetyRestorePointId: string | null;
  schemaVersion: string;
  now?: Date;
};

/**
 * Agenda a restauração para o próximo desbloqueio. Os arquivos entram primeiro e
 * o manifesto por último, de forma atômica: um agendamento interrompido no
 * meio é ignorado pela inicialização, nunca aplicado pela metade.
 */
export async function stagePendingRestore(options: StageOptions): Promise<PendingRestoreManifest> {
  await ensureDirectory(options.dir);
  const files = pendingRestoreFiles(options.dir);
  await rm(files.manifest, { force: true });

  const partial = `${files.database}.partial`;
  if (options.move) await rename(options.database, partial);
  else await copyFile(options.database, partial);
  const sha256 = await sha256File(partial);
  const { size } = await stat(partial);
  await rename(partial, files.database);
  await restrict(files.database);

  let keySha256: string | null = null;
  if (options.key) {
    const material = await readFile(options.key);
    await writeFile(files.key, material, { mode: 0o600 });
    keySha256 = sha256Buffer(material);
  } else {
    await rm(files.key, { force: true });
  }

  const manifest: PendingRestoreManifest = {
    format: 'talentum-pending-restore',
    formatVersion: 1,
    createdAt: (options.now ?? new Date()).toISOString(),
    source: options.source,
    sourceRestorePointId: options.sourceRestorePointId,
    safetyRestorePointId: options.safetyRestorePointId,
    schemaVersion: options.schemaVersion,
    sha256,
    byteSize: size,
    keySha256,
  };
  await writeJsonAtomic(files.manifest, manifest);
  return manifest;
}

export async function readPendingRestore(dir: string): Promise<PendingRestoreManifest | null> {
  const files = pendingRestoreFiles(dir);
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(await readFile(files.manifest, 'utf8')));
    if (!parsed.success || !(await exists(files.database))) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function cancelPendingRestore(dir: string): Promise<boolean> {
  const files = pendingRestoreFiles(dir);
  const had = await exists(files.manifest);
  await rm(files.manifest, { force: true });
  await rm(files.database, { force: true });
  await rm(files.key, { force: true });
  return had;
}

/** Remove todos os pontos e a restauração agendada. Usado só pela exclusão total. */
export async function deleteAllRestorePoints(dir: string): Promise<number> {
  const points = await listRestorePoints(dir);
  for (const point of points) await deleteRestorePoint(dir, point.id);
  await cancelPendingRestore(dir);
  return points.length;
}
