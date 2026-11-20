/* Banco cifrado: abertura, migrations e migração do banco antigo em claro.

   O SQLite inteiro é cifrado pelo libSQL (`encryptionKey`), com a subchave
   `database` da DEK. O Prisma conversa com ele pelo adaptador oficial
   `@prisma/adapter-libsql`, então nenhuma consulta das rotas muda.

   Datas em milissegundos (`unixepoch-ms`): é o formato que o motor nativo do
   Prisma gravou nos bancos existentes, e o mesmo arquivo continua legível
   depois da migração. */

import { randomBytes } from 'node:crypto';
import { open as openFile, readFile, rename, rm, stat } from 'node:fs/promises';
import { type Client, createClient } from '@libsql/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import { copyDatabase, isPlaintextSqlite, SIDE_FILES } from '../backup/libsql-file.ts';
import { backupDirectory } from '../backup/paths.ts';
import { encryptLegacyBackups, type OpenPaths, prepareEncryptedDatabase as prepareOnOpen } from '../backup/startup.ts';
import { localKeyPath } from '../local-key.ts';
import { subkey } from './crypto.ts';
import { readMigrations } from './migrations.ts';
import { onLock } from './session.ts';
import { databasePath } from './vault-file.ts';

export { isPlaintextSqlite };

type Open = { prisma: PrismaClient; path: string };
const store = globalThis as typeof globalThis & { talentumDatabase?: { current: Open | null; hooked: boolean } };
store.talentumDatabase ??= { current: null, hooked: false };
const state = store.talentumDatabase;

if (!state.hooked) {
  state.hooked = true;
  onLock(async () => {
    const current = state.current;
    state.current = null;
    await current?.prisma.$disconnect();
  });
}

/** O Prisma do banco aberto, ou `null` enquanto o cofre está bloqueado. */
export function currentPrisma(): PrismaClient | null {
  return state.current?.prisma ?? null;
}

export function databaseKeyHex(dek: Buffer): string {
  return subkey(dek, 'database').toString('hex');
}

export function openEncryptedClient(path: string, dek: Buffer): Client {
  return createClient({ url: `file:${path}`, encryptionKey: databaseKeyHex(dek), intMode: 'bigint' });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Arquivo em claro deixado por uma configuração interrompida no meio. */
export function pendingPlaintextPath(path = databasePath()): string {
  return `${path}.plaintext-pending-removal`;
}

/** Existe um banco antigo em claro para trazer para o cofre? */
export async function legacyPlaintextSource(path = databasePath()): Promise<string | null> {
  if (await isPlaintextSqlite(pendingPlaintextPath(path))) return pendingPlaintextPath(path);
  if (await isPlaintextSqlite(path)) return path;
  return null;
}

/** Caminhos que a abertura prepara junto com o banco: pontos de restauração e chave do dispositivo. */
export function openPaths(path = databasePath()): OpenPaths {
  return { database: path, backups: backupDirectory(), deviceKey: localKeyPath() };
}

/**
 * Abre o banco cifrado e instala o Prisma. Antes, com a chave em memória e
 * nenhuma conexão aberta: aplica a restauração agendada, cria o ponto
 * `pre_migration` quando há migration pendente e aplica as migrations
 * (src/server/backup/startup.ts).
 */
export async function openDatabase(dek: Buffer, path = databasePath()): Promise<void> {
  if (state.current) {
    const previous = state.current;
    state.current = null;
    await previous.prisma.$disconnect();
  }
  const migrations = await readMigrations();
  await prepareOnOpen(openPaths(path), databaseKeyHex(dek), migrations);
  const adapter = new PrismaLibSQL({ url: `file:${path}`, encryptionKey: databaseKeyHex(dek), intMode: 'bigint' }, { timestampFormat: 'unixepoch-ms' });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();
  state.current = { prisma, path };
}

/**
 * Copia um banco em claro inteiro para um banco cifrado novo, conferindo a
 * contagem de linhas de cada tabela e a integridade do destino
 * (src/server/backup/libsql-file.ts).
 */
export async function copyPlaintextToEncrypted(source: string, target: string, dek: Buffer): Promise<{ tables: number; rows: number }> {
  const from = createClient({ url: `file:${source}`, intMode: 'bigint' });
  try {
    await from.execute('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    from.close();
  }
  return copyDatabase(source, null, target, databaseKeyHex(dek));
}

/**
 * Sobrescreve o arquivo com bytes aleatórios antes de apagar.
 *
 * Melhor esforço: em SSD, em sistemas de arquivos com cópia na escrita e em
 * pastas sincronizadas, blocos antigos podem sobreviver à sobrescrita. Por isso
 * a documentação recomenda cifrar o disco do sistema (docs/SECURITY.md).
 */
export async function secureRemove(path: string): Promise<void> {
  for (const file of [path, ...SIDE_FILES.map((suffix) => path + suffix)]) {
    try {
      const { size } = await stat(file);
      const handle = await openFile(file, 'r+');
      try {
        const chunk = 1024 * 1024;
        for (let offset = 0; offset < size; offset += chunk) {
          const length = Math.min(chunk, size - offset);
          await handle.write(randomBytes(length), 0, length, offset);
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rm(file, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

/**
 * Prepara o banco cifrado no primeiro uso do cofre.
 *
 * Com um banco antigo em claro: copia e verifica para `<banco>.encrypting`,
 * renomeia o original para `.plaintext-pending-removal`, coloca o cifrado no
 * lugar e só então devolve `finish`, que apaga o original depois de o cofre
 * ter sido gravado. Se o processo cair antes de o cofre existir, o arquivo em
 * claro continua lá e a próxima configuração recomeça a partir dele.
 *
 * `finish` também cifra os pontos de restauração e a restauração agendada que
 * versões anteriores ao cofre deixaram em claro (src/server/backup/startup.ts).
 * Roda só depois de o cofre existir: antes disso, a chave poderia se perder e
 * levar as cópias junto.
 */
export async function prepareEncryptedDatabase(dek: Buffer, path = databasePath()): Promise<{ migrated: boolean; finish: () => Promise<void> }> {
  const keyHex = databaseKeyHex(dek);
  const encryptBackups = async () => {
    await encryptLegacyBackups(backupDirectory(), keyHex, secureRemove);
  };
  const source = await legacyPlaintextSource(path);
  if (!source) {
    // Banco sem cofre e sem cabeçalho em claro é cifrado com chave perdida (configuração anterior interrompida
    // depois da troca de arquivos). Ilegível para sempre; fica guardado ao lado, nunca apagado em silêncio.
    if (await fileExists(path)) await rename(path, `${path}.unreadable-${Date.now()}`);
    for (const suffix of SIDE_FILES) await rm(path + suffix, { force: true });
    return { migrated: false, finish: encryptBackups };
  }
  const encrypting = `${path}.encrypting`;
  await copyPlaintextToEncrypted(source, encrypting, dek);
  if (source === path) {
    for (const suffix of SIDE_FILES) {
      if (await fileExists(path + suffix)) await rename(path + suffix, pendingPlaintextPath(path) + suffix);
    }
    await rename(path, pendingPlaintextPath(path));
  } else if (await fileExists(path)) {
    await rename(path, `${path}.unreadable-${Date.now()}`);
  }
  await rename(encrypting, path);
  return {
    migrated: true,
    finish: async () => {
      await secureRemove(pendingPlaintextPath(path));
      await encryptBackups();
    },
  };
}

/** Usado pelos testes: confirma que nenhum texto marcador aparece no arquivo. */
export async function fileContains(path: string, marker: string): Promise<boolean> {
  const content = await readFile(path);
  return content.includes(Buffer.from(marker, 'utf8'));
}
