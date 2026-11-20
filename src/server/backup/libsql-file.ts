/* Acesso ao conteúdo de um arquivo de banco pelo libSQL, cifrado ou não.

   É a implementação de `DatabaseFileAdapter` (restore-core.ts) para o banco
   cifrado do cofre (docs/decisions/0009-local-vault-and-encrypted-database.md).

   Por que não `VACUUM INTO`: com o banco aberto pelo libSQL com
   `encryptionKey`, `VACUUM INTO` grava a cópia **em claro**, e
   `ATTACH ... KEY` também cria o anexo em claro (conferido com
   @libsql/client 0.8.1; `tests/restore-points.test.mjs` trava esse
   comportamento). Só a conexão aberta com `encryptionKey` cifra o arquivo. Por
   isso a cópia abre o destino com a chave e copia o schema e as linhas dentro
   de uma transação de leitura na origem: o resultado é consistente mesmo com o
   aplicativo gravando ao mesmo tempo, e nenhum byte em claro chega ao disco.

   Sem imports de alias: o executor de testes do Node importa este módulo. */

import { open as openFile, rm } from 'node:fs/promises';
import { type Client, createClient, type InValue } from '@libsql/client';
import type { DatabaseFileAdapter } from './restore-core.ts';

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');
export const SIDE_FILES = ['-wal', '-shm', '-journal'] as const;

/** Abre um arquivo pelo libSQL. `keyHex` nulo: arquivo em claro (só o banco antigo, antes do cofre). */
export function openDatabaseFile(path: string, keyHex: string | null): Client {
  return createClient({ url: `file:${path}`, ...(keyHex ? { encryptionKey: keyHex } : {}), intMode: 'bigint' });
}

/** O arquivo começa com o cabeçalho do SQLite em claro? */
export async function isPlaintextSqlite(path: string): Promise<boolean> {
  try {
    const handle = await openFile(path, 'r');
    try {
      const buffer = Buffer.alloc(16);
      const { bytesRead } = await handle.read(buffer, 0, 16, 0);
      return bytesRead === 16 && buffer.equals(SQLITE_HEADER);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * Copia um banco inteiro para um arquivo novo, cifrado com `targetKeyHex`.
 *
 * Lê o schema do próprio arquivo, então serve para qualquer versão de
 * migrations, inclusive `_prisma_migrations`. Confere a contagem de linhas de
 * cada tabela e a integridade do destino antes de devolver; em falha, o destino
 * é apagado.
 */
export async function copyDatabase(source: string, sourceKeyHex: string | null, target: string, targetKeyHex: string): Promise<{ tables: number; rows: number }> {
  for (const suffix of ['', ...SIDE_FILES]) await rm(target + suffix, { force: true });
  const from = openDatabaseFile(source, sourceKeyHex);
  const to = openDatabaseFile(target, targetKeyHex);
  let rows = 0;
  let ok = false;
  try {
    const read = await from.transaction('read');
    try {
      const objects = await read.execute(
        "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name",
      );
      const tables: string[] = [];
      const tableSql: string[] = [];
      const later: string[] = [];
      for (const row of objects.rows) {
        if (String(row.type) === 'table') {
          tables.push(String(row.name));
          tableSql.push(String(row.sql));
        } else later.push(String(row.sql));
      }
      await to.execute('PRAGMA foreign_keys = OFF');
      for (const sql of tableSql) await to.execute(sql);
      const counts = new Map<string, string>();
      for (const table of tables) {
        const columnsResult = await read.execute(`PRAGMA table_info(${quote(table)})`);
        const columns = columnsResult.rows.map((column) => String(column.name));
        if (columns.length === 0) continue;
        const columnList = columns.map(quote).join(', ');
        const placeholders = columns.map(() => '?').join(', ');
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
          const page = await read.execute({ sql: `SELECT ${columnList} FROM ${quote(table)} ORDER BY rowid LIMIT ? OFFSET ?`, args: [pageSize, offset] });
          if (page.rows.length === 0) break;
          await to.batch(
            page.rows.map((row) => ({
              sql: `INSERT INTO ${quote(table)} (${columnList}) VALUES (${placeholders})`,
              args: columns.map((_column, index) => row[index] as InValue),
            })),
            'write',
          );
          rows += page.rows.length;
          if (page.rows.length < pageSize) break;
        }
        counts.set(table, String((await read.execute(`SELECT count(*) AS n FROM ${quote(table)}`)).rows[0].n));
      }
      // Contadores de AUTOINCREMENT, quando existem, seguem iguais aos da origem.
      const sequence = await read.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'");
      if (sequence.rows.length > 0) {
        const values = await read.execute('SELECT name, seq FROM sqlite_sequence');
        await to.execute('DELETE FROM sqlite_sequence');
        for (const row of values.rows) await to.execute({ sql: 'INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', args: [row.name as InValue, row.seq as InValue] });
      }
      const version = await read.execute('PRAGMA user_version');
      const userVersion = Number(version.rows[0]?.[0] ?? 0);
      if (Number.isInteger(userVersion) && userVersion !== 0) await to.execute(`PRAGMA user_version = ${userVersion}`);
      for (const sql of later) await to.execute(sql);

      // Verificação antes de devolver: mesma contagem em todas as tabelas e destino íntegro.
      for (const [table, count] of counts) {
        const copied = await to.execute(`SELECT count(*) AS n FROM ${quote(table)}`);
        if (String(copied.rows[0].n) !== count) throw new Error('COPY_MISMATCH');
      }
      const integrity = await to.execute('PRAGMA integrity_check');
      if (String(integrity.rows[0]?.[0]) !== 'ok') throw new Error('COPY_CORRUPT');
      await to.execute('PRAGMA foreign_keys = ON');
      ok = true;
      return { tables: tables.length, rows };
    } finally {
      read.close();
    }
  } finally {
    from.close();
    to.close();
    if (!ok) for (const suffix of ['', ...SIDE_FILES]) await rm(target + suffix, { force: true });
  }
}

/** Migrations concluídas registradas no arquivo, em ordem. */
export async function appliedMigrationNames(client: Pick<Client, 'execute'>): Promise<string[]> {
  const table = await client.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'");
  if (table.rows.length === 0) return [];
  const result = await client.execute(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
  );
  return result.rows.map((row) => String(row.migration_name));
}

/** Integridade e migrations de um arquivo, aberto com a chave. Chave errada ou arquivo em claro: não íntegro. */
export async function inspectDatabaseFile(file: string, keyHex: string): Promise<{ integrityOk: boolean; migrations: string[] }> {
  // Arquivo em claro nunca é aceito como cópia do banco cifrado.
  if (await isPlaintextSqlite(file)) return { integrityOk: false, migrations: [] };
  const client = openDatabaseFile(file, keyHex);
  try {
    const check = await client.execute('PRAGMA quick_check');
    const integrityOk = check.rows.length === 1 && String(check.rows[0][0]) === 'ok';
    return { integrityOk, migrations: integrityOk ? await appliedMigrationNames(client) : [] };
  } catch {
    return { integrityOk: false, migrations: [] };
  } finally {
    client.close();
  }
}

/** Adaptador dos pontos de restauração para o banco cifrado em `databaseFile`. */
export function encryptedFileAdapter(databaseFile: string, keyHex: string): DatabaseFileAdapter {
  return {
    async snapshot(destination) {
      await copyDatabase(databaseFile, keyHex, destination, keyHex);
    },
    inspect: (file) => inspectDatabaseFile(file, keyHex),
  };
}
