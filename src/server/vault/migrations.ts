/* Executor de migrations pela conexão cifrada.

   `prisma migrate deploy` abre o arquivo sem a chave e não lê um banco
   cifrado. Este executor aplica as mesmas pastas `prisma/migrations/<nome>/
   migration.sql`, em ordem de nome, e registra cada uma em `_prisma_migrations`
   com o mesmo formato do Prisma (checksum SHA-256 do arquivo, início, fim e
   número de passos). Serve para qualquer pasta futura, sem lista fixa.

   Regras herdadas do `migrate deploy`:
   - migration já aplicada não roda de novo (idempotente);
   - migration que falhou no meio bloqueia as seguintes até ser resolvida;
   - o SQL roda como está, sem transação em volta, porque as migrations de
     redefinição de tabela do SQLite usam `PRAGMA foreign_keys`, que não muda
     dentro de uma transação.

   E a trava de migration destrutiva que antes ficava em
   `scripts/migration-preflight.mjs`: com dados já aplicados, `DROP TABLE`,
   `DROP COLUMN`, `TRUNCATE TABLE` ou `DELETE FROM` pendente exige um backup
   verificado da versão de schema atual — o ponto de restauração automático
   `pre_migration` criado por src/server/backup/startup.ts logo antes
   (`automaticBackupId`), ou `TALENTUM_VERIFIED_BACKUP_ID` apontando um
   `DatabaseBackup` com status:'verified', checksum SHA-256 e tamanho. */

import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Client } from '@libsql/client';

export type Migration = { name: string; sql: string; checksum: string };

export class MigrationError extends Error {
  readonly code: 'FAILED_MIGRATION_PENDING' | 'MIGRATION_FAILED' | 'DESTRUCTIVE_MIGRATION_BLOCKED' | 'MIGRATIONS_MISSING';
  readonly migration?: string;

  constructor(code: MigrationError['code'], migration?: string) {
    super(migration ? `${code}: ${migration}` : code);
    this.name = 'MigrationError';
    this.code = code;
    this.migration = migration;
  }
}

const DESTRUCTIVE = /\b(?:DROP\s+(?:TABLE|COLUMN)|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i;

export function migrationsDirectory(): string {
  const override = process.env.TALENTUM_MIGRATIONS_DIR;
  if (override && override.trim().length > 0) return override.trim();
  return resolve(process.cwd(), 'prisma', 'migrations');
}

export async function readMigrations(directory = migrationsDirectory()): Promise<Migration[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new MigrationError('MIGRATIONS_MISSING');
  }
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const migrations: Migration[] = [];
  for (const name of names) {
    let sql: string;
    try {
      sql = await readFile(join(directory, name, 'migration.sql'), 'utf8');
    } catch {
      continue; // pasta sem migration.sql (por exemplo, rascunho vazio): o Prisma também ignora
    }
    migrations.push({ name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  if (migrations.length === 0) throw new MigrationError('MIGRATIONS_MISSING');
  return migrations;
}

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

type Row = { migration_name: string; finished_at: unknown; rolled_back_at: unknown };

export type MigrationOptions = {
  verifiedBackupId?: string | null;
  /** Ponto `pre_migration` criado e verificado agora, com o banco nesta versão. */
  automaticBackupId?: string | null;
  now?: () => number;
};

/** Aplica as migrations pendentes. Devolve os nomes aplicados nesta chamada. */
export async function applyMigrations(client: Client, migrations: Migration[], options: MigrationOptions = {}): Promise<string[]> {
  const now = options.now ?? Date.now;
  await client.execute(CREATE_TABLE);
  const result = await client.execute('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"');
  const rows = result.rows as unknown as Row[];

  const failed = rows.find((row) => row.finished_at === null && row.rolled_back_at === null);
  if (failed) throw new MigrationError('FAILED_MIGRATION_PENDING', failed.migration_name);

  const applied = new Set(rows.filter((row) => row.finished_at !== null && row.rolled_back_at === null).map((row) => row.migration_name));
  const pending = migrations.filter((migration) => !applied.has(migration.name));
  if (pending.length === 0) return [];

  // Banco novo não tem dado a perder; a trava vale quando já existe schema aplicado.
  const destructive = applied.size > 0 ? pending.filter((migration) => DESTRUCTIVE.test(migration.sql)) : [];
  if (destructive.length > 0 && !options.automaticBackupId) await requireVerifiedBackup(client, [...applied].sort().at(-1) ?? '', options.verifiedBackupId ?? process.env.TALENTUM_VERIFIED_BACKUP_ID ?? null, destructive);

  const done: string[] = [];
  for (const migration of pending) {
    const id = randomUUID();
    await client.execute({
      sql: 'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)',
      args: [id, migration.checksum, migration.name, now()],
    });
    try {
      await client.executeMultiple(migration.sql);
    } catch {
      // O texto do erro do SQLite pode citar valores; o registro guarda só o código.
      await client.execute({ sql: 'UPDATE "_prisma_migrations" SET logs = ? WHERE id = ?', args: ['MIGRATION_FAILED', id] });
      throw new MigrationError('MIGRATION_FAILED', migration.name);
    }
    await client.execute({ sql: 'UPDATE "_prisma_migrations" SET finished_at = ?, applied_steps_count = 1 WHERE id = ?', args: [now(), id] });
    done.push(migration.name);
  }
  return done;
}

async function requireVerifiedBackup(client: Client, lastApplied: string, backupId: string | null, destructive: Migration[]) {
  const blocked = () => new MigrationError('DESTRUCTIVE_MIGRATION_BLOCKED', destructive.map((migration) => migration.name).join(', '));
  if (!backupId) throw blocked();
  const backup = await client.execute({
    sql: `SELECT "schemaVersion", "checksum", "byteSize" FROM "DatabaseBackup" WHERE "id" = ? AND "status" = 'verified' AND "verifiedAt" IS NOT NULL LIMIT 1`,
    args: [backupId],
  });
  const row = backup.rows[0] as unknown as { schemaVersion: string; checksum: string; byteSize: number | bigint } | undefined;
  if (!row || row.schemaVersion !== lastApplied || !/^[a-f0-9]{64}$/i.test(String(row.checksum)) || Number(row.byteSize) <= 0) throw blocked();
}
