/* Preparação do banco cifrado a cada abertura, antes de o Prisma conectar.

   Roda no desbloqueio do cofre (`openDatabase` em src/server/vault/database.ts),
   o único momento em que a chave do banco está em memória e nenhuma conexão
   está aberta. Substitui o antigo `scripts/migration-preflight.mjs`, que rodava
   antes de `prisma migrate deploy` e não tinha a chave. Nesta ordem:

   1. Aplica a restauração agendada (`talentum-backups/pending-restore.*`):
      confere o SHA-256 da cópia e da chave do dispositivo, abre a cópia com a
      chave (integridade e versão do schema conhecida por esta versão do
      aplicativo), guarda o banco atual num ponto automático (`pre_restore`) e
      só então troca os arquivos por `rename`, atômico no mesmo sistema de
      arquivos. Uma restauração que não passa na verificação é descartada e o
      banco atual continua em uso: o desbloqueio nunca fica preso a ela.
   2. Com migration pendente num banco que já tem schema, cria um ponto
      automático verificado (`pre_migration`) e grava os metadados em
      `DatabaseBackup`.
   3. Aplica as migrations pendentes (`applyMigrations`), que bloqueia
      migration destrutiva sem um backup verificado: o ponto do passo 2, ou o
      informado em TALENTUM_VERIFIED_BACKUP_ID.

   Todo arquivo gravado aqui é cifrado com a chave do banco: nenhuma cópia em
   claro passa pelo disco (libsql-file.ts explica por que não `VACUUM INTO`).

   Sem imports de alias: o executor de testes do Node importa este módulo. */

import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Client } from '@libsql/client';
import { resetLocalKeyCache } from '../local-key.ts';
import { applyMigrations, type Migration } from '../vault/migrations.ts';
import { appliedMigrationNames, copyDatabase, encryptedFileAdapter, inspectDatabaseFile, isPlaintextSqlite, openDatabaseFile, SIDE_FILES } from './libsql-file.ts';
import { pendingRestoreFiles, restorePointFile } from './paths.ts';
import {
  applyRetention,
  createRestorePoint,
  isSchemaCompatible,
  listRestorePoints,
  readPendingRestore,
  type RestorePointManifest,
  sha256Buffer,
  sha256File,
} from './restore-core.ts';

export type OpenPaths = {
  /** Banco ativo. */
  database: string;
  /** Pasta `talentum-backups`. */
  backups: string;
  /** Chave do dispositivo (chaves PIX), docs/decisions/0003-local-device-key.md. */
  deviceKey: string;
};

type Log = (message: string) => void;
/* As mensagens não citam caminho, valor nem conteúdo do banco. */
const defaultLog: Log = (message) => console.info(`[talentum] ${message}`);

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
    /* sem modo POSIX: vale a ACL da pasta do usuário */
  }
}

export type PendingRestoreResult = { status: 'none' } | { status: 'rejected'; reason: string } | { status: 'applied'; safetyRestorePointId: string | null };

/**
 * Aplica a restauração agendada, se houver. Nunca lança por causa do conteúdo
 * agendado; só por falha ao guardar o banco atual, e aí nada foi trocado.
 */
export async function applyPendingRestore(paths: OpenPaths, keyHex: string, knownMigrations: string[], log: Log = defaultLog): Promise<PendingRestoreResult> {
  const files = pendingRestoreFiles(paths.backups);
  if (!(await exists(files.manifest))) return { status: 'none' };

  const discard = async (reason: string): Promise<PendingRestoreResult> => {
    for (const file of [files.manifest, files.database, files.key]) await rm(file, { force: true });
    log(`Restauração agendada descartada: ${reason}. Os dados atuais continuam em uso.`);
    return { status: 'rejected', reason };
  };

  const manifest = await readPendingRestore(paths.backups);
  if (!manifest) return discard('agendamento incompleto');
  if ((await sha256File(files.database)) !== manifest.sha256) return discard('a cópia foi alterada');
  if (manifest.keySha256 && (!(await exists(files.key)) || sha256Buffer(await readFile(files.key)) !== manifest.keySha256)) return discard('a chave foi alterada');

  const inspected = await inspectDatabaseFile(files.database, keyHex);
  if (!inspected.integrityOk || inspected.migrations.at(-1) !== manifest.schemaVersion) return discard('a cópia não passou na verificação de integridade');
  if (!isSchemaCompatible(inspected.migrations, knownMigrations)) return discard('a cópia é de uma versão que este aplicativo não reconhece');

  // O banco atual vira um ponto de restauração antes da troca: a restauração também pode ser desfeita.
  let safety: RestorePointManifest | null = null;
  if (await exists(paths.database)) {
    safety = await createRestorePoint({ dir: paths.backups, keyPath: paths.deviceKey, adapter: encryptedFileAdapter(paths.database, keyHex), kind: 'pre_restore' });
  }

  for (const suffix of SIDE_FILES) await rm(`${paths.database}${suffix}`, { force: true });
  await mkdir(dirname(paths.database), { recursive: true });
  await rename(files.database, paths.database);
  await restrict(paths.database);
  if (manifest.keySha256) {
    await rename(files.key, paths.deviceKey);
    await restrict(paths.deviceKey);
    // A chave PIX em memória é a do banco anterior.
    resetLocalKeyCache();
  }
  await rm(files.manifest, { force: true });
  await rm(files.key, { force: true });
  await applyRetention(paths.backups, undefined, safety ? [safety.id] : []);
  log('Restauração aplicada. O banco anterior foi guardado como ponto de restauração.');
  return { status: 'applied', safetyRestorePointId: safety?.id ?? null };
}

/** Grava os metadados do ponto em `DatabaseBackup`, quando a tabela e um perfil existem. */
export async function recordBackupRow(client: Pick<Client, 'execute'>, manifest: RestorePointManifest): Promise<boolean> {
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('DatabaseBackup', 'LocalProfile')");
  if (tables.rows.length < 2) return false;
  const profile = await client.execute('SELECT id FROM "LocalProfile" ORDER BY "createdAt" ASC LIMIT 1');
  if (profile.rows.length === 0) return false;
  const columns = new Set((await client.execute("SELECT name FROM pragma_table_info('DatabaseBackup')")).rows.map((row) => String(row.name)));
  const createdAt = Date.parse(manifest.createdAt);
  const row: Record<string, string | number> = {
    id: manifest.id,
    profileId: String(profile.rows[0].id),
    schemaVersion: manifest.schemaVersion,
    checksum: manifest.sha256,
    byteSize: manifest.byteSize,
    status: 'verified',
    verifiedAt: createdAt,
    createdAt,
  };
  if (columns.has('kind')) row.kind = manifest.kind;
  const names = Object.keys(row);
  await client.execute({
    sql: `INSERT INTO "DatabaseBackup" (${names.map((name) => `"${name}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    args: Object.values(row),
  });
  return true;
}

export type PrepareResult = { restore: PendingRestoreResult; restorePoint: RestorePointManifest | null; applied: string[] };

/**
 * Restauração agendada, ponto antes das migrations e migrations, nessa ordem.
 * Quem chama abre o Prisma depois.
 */
export async function prepareEncryptedDatabase(
  paths: OpenPaths,
  keyHex: string,
  migrations: Migration[],
  options: { log?: Log; verifiedBackupId?: string | null } = {},
): Promise<PrepareResult> {
  const log = options.log ?? defaultLog;
  const restore = await applyPendingRestore(
    paths,
    keyHex,
    migrations.map((migration) => migration.name),
    log,
  );

  const client = openDatabaseFile(paths.database, keyHex);
  try {
    await client.execute('PRAGMA journal_mode = WAL');
    const applied = new Set(await appliedMigrationNames(client));
    const pending = migrations.filter((migration) => !applied.has(migration.name));
    let restorePoint: RestorePointManifest | null = null;
    if (pending.length > 0 && applied.size > 0) {
      try {
        restorePoint = await createRestorePoint({ dir: paths.backups, keyPath: paths.deviceKey, adapter: encryptedFileAdapter(paths.database, keyHex), kind: 'pre_migration' });
        await applyRetention(paths.backups, undefined, [restorePoint.id]);
        await recordBackupRow(client, restorePoint);
        log(`Ponto de restauração criado antes de ${pending.length} migration(s).`);
      } catch {
        restorePoint = null;
        log('Não foi possível criar o ponto de restauração antes das migrations.');
      }
    }
    const done = await applyMigrations(client, migrations, { automaticBackupId: restorePoint?.id ?? null, verifiedBackupId: options.verifiedBackupId });
    return { restore, restorePoint, applied: done };
  } finally {
    client.close();
  }
}

/**
 * Pontos de restauração e restauração agendada em claro, deixados por versões
 * anteriores ao cofre, viram cópias cifradas com a chave do banco. O arquivo em
 * claro é sobrescrito antes de sair. Roda na configuração do cofre.
 */
export async function encryptLegacyBackups(backups: string, keyHex: string, secureRemove: (file: string) => Promise<void>): Promise<number> {
  let converted = 0;
  const convert = async (file: string): Promise<{ sha256: string; byteSize: number } | null> => {
    if (!(await isPlaintextSqlite(file))) return null;
    const partial = `${file}.encrypting`;
    await copyDatabase(file, null, partial, keyHex);
    const result = { sha256: await sha256File(partial), byteSize: (await stat(partial)).size };
    await secureRemove(file);
    await rename(partial, file);
    await restrict(file);
    converted += 1;
    return result;
  };

  for (const point of await listRestorePoints(backups)) {
    const file = restorePointFile(backups, point.id, 'sqlite');
    const changed = await convert(file).catch(() => null);
    if (!changed) continue;
    const { status: _status, ...manifest } = point;
    await writeJson(restorePointFile(backups, point.id, 'json'), { ...manifest, ...changed });
  }

  const pending = await readPendingRestore(backups);
  if (pending) {
    const files = pendingRestoreFiles(backups);
    const changed = await convert(files.database).catch(() => null);
    if (changed) await writeJson(files.manifest, { ...pending, ...changed });
  }
  return converted;
}

async function writeJson(file: string, value: unknown) {
  await writeFile(`${file}.partial`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(`${file}.partial`, file);
}
