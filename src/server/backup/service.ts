/* Pontos de restauração e backup cifrado no aplicativo em execução.

   Liga o núcleo de arquivo (`restore-core.ts`) e a cifragem (`encrypted.ts`)
   ao banco ativo pelo Prisma. Toda operação passa por uma fila única
   (`exclusive`): duas cópias simultâneas do mesmo banco, ou um agendamento no
   meio de uma exclusão, não acontecem. A fila também limita o custo do scrypt
   (128 MiB por derivação) a uma derivação por vez.

   Os pontos de restauração pertencem ao **dispositivo**, não ao perfil: o banco
   tem um perfil só, e depois de apagar todos os dados (que apaga o perfil) a
   pessoa ainda precisa ver e restaurar o ponto criado antes da exclusão. As
   linhas de `DatabaseBackup` são o índice no banco, escopado pelo perfil, e
   são sincronizadas a partir do disco a cada escrita. */

import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { copyDatabase, encryptedFileAdapter, inspectDatabaseFile } from '@/server/backup/libsql-file';
import { db, VaultLockedError } from '@/server/db';
import { databaseKeyHex } from '@/server/vault/database';
import { currentDek } from '@/server/vault/session';
import { databasePath } from '@/server/vault/vault-file';
import { localKeyPath } from '@/server/local-key';
import { backupDirectory, isRestorePointId } from '@/server/backup/paths';
import {
  applyRetention,
  cancelPendingRestore,
  createRestorePoint,
  deleteRestorePoint,
  isSchemaCompatible,
  listRestorePoints,
  readPendingRestore,
  RestorePointError,
  stagePendingRestore,
  verifyRestorePoint,
  type RestorePointKind,
  type RestorePointManifest,
  type DatabaseFileAdapter,
} from '@/server/backup/restore-core';
import { decryptBackup, encryptBackup, MAX_BACKUP_BYTES } from '@/server/backup/encrypted';

const globalQueue = globalThis as typeof globalThis & { talentumBackupQueue?: Promise<unknown> };

/** Executa uma tarefa de backup por vez, na ordem de chegada. */
export function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const previous = globalQueue.talentumBackupQueue ?? Promise.resolve();
  const run = previous.then(task, task);
  globalQueue.talentumBackupQueue = run.catch(() => undefined);
  return run;
}

/** Chave do banco em uso, derivada da DEK do cofre desbloqueado. */
function databaseKey(): string {
  const dek = currentDek();
  if (!dek) throw new VaultLockedError();
  try {
    return databaseKeyHex(dek);
  } finally {
    dek.fill(0);
  }
}

/**
 * Adaptador do banco cifrado: a cópia sai cifrada com a mesma chave do banco
 * (src/server/backup/libsql-file.ts explica por que não `VACUUM INTO`). Um
 * ponto de restauração nunca fica em claro no disco e só abre com este cofre.
 */
export function vaultAdapter(): DatabaseFileAdapter {
  return encryptedFileAdapter(databasePath(), databaseKey());
}

async function currentMigrations(): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
  );
  return rows.map((row) => row.migration_name);
}

async function recordRow(profileId: string | null, manifest: RestorePointManifest) {
  if (!profileId) return;
  await db.databaseBackup.upsert({
    where: { id: manifest.id },
    create: {
      id: manifest.id,
      profileId,
      schemaVersion: manifest.schemaVersion,
      checksum: manifest.sha256,
      byteSize: manifest.byteSize,
      status: 'verified',
      verifiedAt: new Date(manifest.createdAt),
      kind: manifest.kind,
      createdAt: new Date(manifest.createdAt),
    },
    update: {},
  });
}

async function recordEvent(profileId: string | null, kind: string, title: string, description: string) {
  if (!profileId) return;
  await db.timelineEvent.create({ data: { profileId, kind, title, description, reversible: false } });
}

async function createPoint(kind: RestorePointKind, profileId: string | null, idempotencyKey: string | null = null) {
  const manifest = await createRestorePoint({ dir: backupDirectory(), keyPath: localKeyPath(), adapter: vaultAdapter(), kind, idempotencyKey });
  await recordRow(profileId, manifest);
  await applyRetention(backupDirectory(), undefined, [manifest.id]);
  return manifest;
}

export type RestorePointView = {
  id: string;
  kind: RestorePointKind;
  createdAt: string;
  byteSize: number;
  status: 'available' | 'damaged';
};

function view(point: RestorePointManifest & { status?: 'available' | 'damaged' }): RestorePointView {
  return { id: point.id, kind: point.kind, createdAt: point.createdAt, byteSize: point.byteSize, status: point.status ?? 'available' };
}

export async function listRestorePointsView() {
  const dir = backupDirectory();
  const [points, pending] = await Promise.all([listRestorePoints(dir), readPendingRestore(dir)]);
  return {
    restorePoints: points.map(view),
    pendingRestore: pending
      ? { createdAt: pending.createdAt, source: pending.source, sourceRestorePointId: pending.sourceRestorePointId, safetyRestorePointId: pending.safetyRestorePointId }
      : null,
  };
}

/** Ponto criado a pedido. A mesma chave de idempotência devolve o mesmo ponto. */
export function createManualRestorePoint(profileId: string | null, idempotencyKey: string) {
  return exclusive(async () => {
    const existing = (await listRestorePoints(backupDirectory())).find((point) => point.idempotencyKey === idempotencyKey);
    if (existing) return { restorePoint: view(existing), created: false };
    const manifest = await createPoint('manual', profileId, idempotencyKey);
    await recordEvent(profileId, 'restore_point', 'Ponto de restauração criado', 'Uma cópia verificada dos dados foi guardada neste computador.');
    return { restorePoint: view(manifest), created: true };
  });
}

/** Ponto automático, usado antes de restaurar e de apagar todos os dados. */
export function createAutomaticRestorePoint(kind: Exclude<RestorePointKind, 'manual'>, profileId: string | null) {
  return createPoint(kind, profileId);
}

/**
 * Agenda a restauração de um ponto. Confere o ponto (SHA-256, integridade e
 * versão do schema) e guarda o banco atual num ponto automático antes de
 * agendar. A troca acontece no próximo desbloqueio (src/server/backup/startup.ts).
 */
export function scheduleRestore(profileId: string | null, restorePointId: string) {
  return exclusive(async () => {
    const dir = backupDirectory();
    const verified = await verifyRestorePoint(dir, restorePointId, vaultAdapter());
    if (!isSchemaCompatible(verified.migrations, await currentMigrations())) throw new RestorePointError('SCHEMA_UNKNOWN');
    const safety = await createPoint('pre_restore', profileId);
    const pending = await stagePendingRestore({
      dir,
      database: verified.database,
      key: verified.key,
      source: 'restore_point',
      sourceRestorePointId: verified.manifest.id,
      safetyRestorePointId: safety.id,
      schemaVersion: verified.manifest.schemaVersion,
    });
    await recordEvent(profileId, 'restore_scheduled', 'Restauração agendada', 'Os dados voltam ao ponto escolhido no próximo desbloqueio do Talentum.');
    return { pending, safetyRestorePointId: safety.id };
  });
}

export function cancelScheduledRestore(profileId: string | null) {
  return exclusive(async () => {
    const cancelled = await cancelPendingRestore(backupDirectory());
    if (cancelled) await recordEvent(profileId, 'restore_cancelled', 'Restauração cancelada', 'Os dados atuais continuam em uso.');
    return cancelled;
  });
}

export function removeRestorePoint(profileId: string | null, restorePointId: string) {
  return exclusive(async () => {
    if (!isRestorePointId(restorePointId)) return false;
    const pending = await readPendingRestore(backupDirectory());
    // O ponto que protege uma restauração agendada não pode sumir antes dela.
    if (pending && (pending.safetyRestorePointId === restorePointId || pending.sourceRestorePointId === restorePointId)) {
      throw new RestorePointError('IN_USE');
    }
    const removed = await deleteRestorePoint(backupDirectory(), restorePointId);
    if (removed && profileId) await db.databaseBackup.deleteMany({ where: { id: restorePointId, profileId } });
    return removed;
  });
}

/**
 * Cópia consistente do banco ativo, cifrada com uma chave aleatória só dela,
 * lida para a memória e apagada do disco. Nada em claro passa pelo disco.
 */
async function snapshotToMemory() {
  const dir = backupDirectory();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const temporary = join(dir, `export-${randomUUID()}.sqlite.partial`);
  const exportKey = randomBytes(32);
  try {
    await copyDatabase(databasePath(), databaseKey(), temporary, exportKey.toString('hex'));
    const inspected = await inspectDatabaseFile(temporary, exportKey.toString('hex'));
    const schemaVersion = inspected.migrations.at(-1);
    if (!inspected.integrityOk || !schemaVersion) throw new RestorePointError('INTEGRITY_FAILED');
    return { database: await readFile(temporary), databaseKey: exportKey, schemaVersion };
  } catch (error) {
    exportKey.fill(0);
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readDeviceKey(): Promise<Buffer | null> {
  try {
    return await readFile(localKeyPath());
  } catch {
    return null;
  }
}

/** Gera o arquivo cifrado com a senha informada. Nada dele fica no disco. */
export function createEncryptedBackup(profileId: string | null, passphrase: string) {
  return exclusive(async () => {
    const { database, databaseKey: exportKey, schemaVersion } = await snapshotToMemory();
    let file: Buffer;
    try {
      file = await encryptBackup({ schemaVersion, database, databaseKey: exportKey, key: await readDeviceKey() }, passphrase);
    } finally {
      exportKey.fill(0);
    }
    await recordEvent(profileId, 'encrypted_backup', 'Backup cifrado gerado', 'Um arquivo cifrado com senha foi baixado neste computador.');
    return file;
  });
}

/**
 * Agenda a restauração de um backup cifrado: decifra, confere a integridade e
 * a versão do schema, guarda o banco atual num ponto automático e só então
 * agenda a troca. A senha nunca é gravada.
 */
export function scheduleEncryptedRestore(profileId: string | null, file: Buffer, passphrase: string) {
  return exclusive(async () => {
    if (file.length > MAX_BACKUP_BYTES) throw new RestorePointError('INTEGRITY_FAILED');
    const content = await decryptBackup(file, passphrase);
    const dir = backupDirectory();
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const incoming = join(dir, `incoming-${randomUUID()}.sqlite`);
    const staged = `${incoming}.staged`;
    const incomingKey = `${incoming}.key`;
    try {
      // A cópia do arquivo chega cifrada com a chave dela; no disco, continua cifrada.
      await writeFile(incoming, content.database, { mode: 0o600 });
      if (content.key) await writeFile(incomingKey, content.key, { mode: 0o600 });
      const fileKey = content.databaseKey.toString('hex');
      const inspected = await inspectDatabaseFile(incoming, fileKey);
      if (!inspected.integrityOk || inspected.migrations.at(-1) !== content.schemaVersion) throw new RestorePointError('INTEGRITY_FAILED');
      if (!isSchemaCompatible(inspected.migrations, await currentMigrations())) throw new RestorePointError('SCHEMA_UNKNOWN');
      // Regrava com a chave do cofre atual: a restauração não depende da senha de quando o backup foi feito.
      await copyDatabase(incoming, fileKey, staged, databaseKey());
      const safety = await createPoint('pre_restore', profileId);
      const pending = await stagePendingRestore({
        dir,
        database: staged,
        key: content.key ? incomingKey : null,
        move: true,
        source: 'encrypted_backup',
        sourceRestorePointId: null,
        safetyRestorePointId: safety.id,
        schemaVersion: content.schemaVersion,
      });
      await recordEvent(profileId, 'restore_scheduled', 'Restauração de backup cifrado agendada', 'Os dados do arquivo entram em uso no próximo desbloqueio do Talentum.');
      return { pending, safetyRestorePointId: safety.id };
    } finally {
      content.database.fill(0);
      content.databaseKey.fill(0);
      content.key?.fill(0);
      await rm(incoming, { force: true });
      await rm(staged, { force: true });
      await rm(incomingKey, { force: true });
    }
  });
}
