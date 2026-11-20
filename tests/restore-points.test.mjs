import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

/* Pontos de restauração (Stage 11) e a preparação do banco cifrado no
   desbloqueio, que aplica a restauração agendada, cria o ponto `pre_migration`
   e aplica as migrations. Tudo roda em pastas temporárias com bancos libSQL
   cifrados e sintéticos: o banco de desenvolvimento nunca é tocado.

   O núcleo do aplicativo (`restore-core.ts`) cria e agenda; a preparação da
   abertura (`startup.ts`, chamada por `openDatabase` no desbloqueio) aplica. Os
   testes de ida e volta garantem que o formato dos manifestos é o mesmo nos dois
   lados. Substituem os testes de `scripts/migration-preflight.mjs`, que saiu
   quando o banco passou a ser cifrado (ADR 0009), com as mesmas garantias. */

const core = await import('../src/server/backup/restore-core.ts');
const paths = await import('../src/server/backup/paths.ts');
const files = await import('../src/server/backup/libsql-file.ts');
const startup = await import('../src/server/backup/startup.ts');
const runner = await import('../src/server/vault/migrations.ts');

const KEY = 'ab'.repeat(32);
const MARKER = 'MARCADOR_SINTETICO_RESTAURACAO_91c2';
const MIGRATIONS = ['20260101000000_init', '20260201000000_second'];

const open = (file, key = KEY) => createClient({ url: `file:${file}`, encryptionKey: key });

async function createDatabase(file, migrations = MIGRATIONS, { note = 'original' } = {}) {
  const database = open(file);
  try {
    await database.executeMultiple(`CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT, finished_at DATETIME, migration_name TEXT, logs TEXT, rolled_back_at DATETIME, started_at DATETIME, applied_steps_count INTEGER);
      CREATE TABLE LocalProfile (id TEXT PRIMARY KEY, displayName TEXT, createdAt INTEGER);
      CREATE TABLE DatabaseBackup (id TEXT PRIMARY KEY, profileId TEXT, schemaVersion TEXT, checksum TEXT, byteSize INTEGER, status TEXT, verifiedAt INTEGER, createdAt INTEGER, kind TEXT NOT NULL DEFAULT 'manual');
      CREATE TABLE "X" ("id" TEXT);
      CREATE TABLE Note (value TEXT);`);
    for (const name of migrations)
      await database.execute({ sql: 'INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES (?, ?, 1, ?, 1, 1)', args: [name, 'x', name] });
    await database.execute({ sql: 'INSERT INTO LocalProfile VALUES (?, ?, ?)', args: ['00000000-0000-4000-8000-000000000001', MARKER, 1] });
    await database.execute({ sql: 'INSERT INTO Note VALUES (?)', args: [note] });
  } finally {
    database.close();
  }
}

async function readNote(file) {
  const database = open(file);
  try {
    return (await database.execute('SELECT value FROM Note')).rows[0]?.value;
  } finally {
    database.close();
  }
}

async function setNote(file, value) {
  const database = open(file);
  try {
    await database.execute({ sql: 'UPDATE Note SET value = ?', args: [value] });
  } finally {
    database.close();
  }
}

/** O arquivo está cifrado no disco: sem cabeçalho SQLite e sem o texto marcador. */
async function assertEncryptedAtRest(file) {
  const bytes = await readFile(file);
  assert.notEqual(bytes.subarray(0, 16).toString('latin1'), 'SQLite format 3\0', 'cabeçalho em claro');
  assert.equal(bytes.includes(Buffer.from(MARKER)), false, 'conteúdo em claro no arquivo');
}

const adapterFor = (databaseFile) => files.encryptedFileAdapter(databaseFile, KEY);

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'talentum-restore-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const migrations = join(root, 'migrations');
  for (const name of MIGRATIONS) {
    await mkdir(join(migrations, name), { recursive: true });
    await writeFile(join(migrations, name, 'migration.sql'), 'CREATE TABLE "X" ("id" TEXT);');
  }
  const database = join(root, 'talentum-local.db');
  const key = join(root, 'talentum-local.key');
  const backups = join(root, 'talentum-backups');
  await createDatabase(database);
  await writeFile(key, Buffer.alloc(32, 7));
  const openPaths = { database, backups, deviceKey: key };
  const prepare = async (options = {}) => startup.prepareEncryptedDatabase(openPaths, KEY, await runner.readMigrations(migrations), { log: () => {}, ...options });
  return { root, database, key, backups, migrations, openPaths, prepare };
}

test('a pasta de backups fica ao lado do banco e o nome do arquivo só aceita UUID', () => {
  assert.equal(paths.backupDirectory({ DATABASE_URL: 'file:/dados/talentum-local.db' }), '/dados/talentum-backups');
  assert.equal(paths.databaseFilePath({ DATABASE_URL: 'file:../temp/x.db' }, '/repo'), '/repo/temp/x.db');
  for (const hostile of ['../../etc/passwd', '..', 'a/b', '00000000-0000-4000-8000-00000000000g', ''])
    assert.throws(() => paths.restorePointFile('/dados/talentum-backups', hostile, 'sqlite'), /INVALID_RESTORE_POINT_ID/, hostile);
  assert.equal(paths.restorePointFile('/b', '00000000-0000-4000-8000-0000000000AA', 'json'), '/b/00000000-0000-4000-8000-0000000000aa.json');
});

test('cria um ponto verificado com cópia, chave e manifesto', async (t) => {
  const w = await workspace(t);
  const point = await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter: adapterFor(w.database), kind: 'manual', idempotencyKey: null });
  assert.equal(point.schemaVersion, MIGRATIONS.at(-1));
  assert.match(point.sha256, /^[a-f0-9]{64}$/);
  assert.ok(point.keySha256, 'a chave do dispositivo acompanha a cópia');
  // A cópia é cifrada como o banco: nunca fica em claro no disco.
  await assertEncryptedAtRest(paths.restorePointFile(w.backups, point.id, 'sqlite'));
  const listed = await core.listRestorePoints(w.backups);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].status, 'available');
  const verified = await core.verifyRestorePoint(w.backups, point.id, adapterFor(w.database));
  assert.deepEqual(verified.migrations, MIGRATIONS);
  // Nenhum arquivo temporário fica para trás.
  assert.deepEqual((await readdir(w.backups)).filter((name) => name.includes('partial')), []);
});

test('cópia ou chave alterada não passa na verificação', async (t) => {
  const w = await workspace(t);
  const adapter = adapterFor(w.database);
  const point = await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter, kind: 'manual' });
  const keyFile = paths.restorePointFile(w.backups, point.id, 'key');
  await writeFile(keyFile, Buffer.alloc(32, 9));
  await assert.rejects(core.verifyRestorePoint(w.backups, point.id, adapter), { code: 'CHECKSUM_MISMATCH' });
  await writeFile(keyFile, Buffer.alloc(32, 7));
  const file = paths.restorePointFile(w.backups, point.id, 'sqlite');
  const bytes = await readFile(file);
  bytes[bytes.length - 1] ^= 0xff;
  await writeFile(file, bytes);
  await assert.rejects(core.verifyRestorePoint(w.backups, point.id, adapter), { code: 'CHECKSUM_MISMATCH' });
  await assert.rejects(core.verifyRestorePoint(w.backups, '../segredo', adapter), { code: 'NOT_FOUND' });
});

test('manifesto forjado que aponta para outro ID é ignorado', async (t) => {
  const w = await workspace(t);
  const point = await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter: adapterFor(w.database), kind: 'manual' });
  const forgedId = '11111111-1111-4111-8111-111111111111';
  const manifest = JSON.parse(await readFile(paths.restorePointFile(w.backups, point.id, 'json'), 'utf8'));
  await writeFile(join(w.backups, `${forgedId}.json`), JSON.stringify({ ...manifest, id: point.id }));
  await writeFile(join(w.backups, 'nao-e-uuid.json'), JSON.stringify(manifest));
  const listed = await core.listRestorePoints(w.backups);
  assert.deepEqual(listed.map((item) => item.id), [point.id]);
});

test('compatibilidade de schema: a cópia não pode ter migration desconhecida', () => {
  assert.equal(core.isSchemaCompatible(['a', 'b'], ['a', 'b', 'c']), true);
  assert.equal(core.isSchemaCompatible(['a', 'b', 'd'], ['a', 'b', 'c']), false);
  assert.equal(core.isSchemaCompatible([], ['a']), false);
});

test('retenção remove automáticos antigos e preserva os manuais', async (t) => {
  const w = await workspace(t);
  const adapter = adapterFor(w.database);
  const manual = await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter, kind: 'manual', now: new Date('2026-01-01T00:00:00Z') });
  const automatic = [];
  for (let i = 0; i < 3; i += 1)
    automatic.push(await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter, kind: 'pre_migration', now: new Date(`2026-02-0${i + 1}T00:00:00Z`) }));
  const removed = await core.applyRetention(w.backups, 2);
  assert.deepEqual(removed, [automatic[0].id, automatic[1].id]);
  const left = (await core.listRestorePoints(w.backups)).map((point) => point.id);
  assert.ok(left.includes(manual.id));
  assert.ok(left.includes(automatic[2].id));
});

test('ida e volta: o aplicativo agenda, o desbloqueio restaura e guarda o banco atual', async (t) => {
  const w = await workspace(t);
  const adapter = adapterFor(w.database);
  const point = await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter, kind: 'manual' });
  await setNote(w.database, 'alterado depois do ponto');
  await writeFile(w.key, Buffer.alloc(32, 8));

  const verified = await core.verifyRestorePoint(w.backups, point.id, adapter);
  await core.stagePendingRestore({
    dir: w.backups,
    database: verified.database,
    key: verified.key,
    source: 'restore_point',
    sourceRestorePointId: point.id,
    safetyRestorePointId: null,
    schemaVersion: point.schemaVersion,
  });
  assert.ok(await core.readPendingRestore(w.backups));
  assert.equal(await readNote(w.database), 'alterado depois do ponto', 'agendar não troca o banco em uso');

  const logs = [];
  const result = await startup.applyPendingRestore(w.openPaths, KEY, MIGRATIONS, (line) => logs.push(line));
  assert.equal(result.status, 'applied');
  assert.equal(await readNote(w.database), 'original');
  await assertEncryptedAtRest(w.database);
  assert.deepEqual(await readFile(w.key), Buffer.alloc(32, 7), 'a chave volta junto com o banco');
  assert.equal(await core.readPendingRestore(w.backups), null);

  // O banco de antes da restauração virou um ponto automático: dá para desfazer.
  const safety = (await core.listRestorePoints(w.backups)).find((item) => item.id === result.safetyRestorePointId);
  assert.equal(safety.kind, 'pre_restore');
  const safetyFile = paths.restorePointFile(w.backups, safety.id, 'sqlite');
  assert.equal(await readNote(safetyFile), 'alterado depois do ponto');
  await assertEncryptedAtRest(safetyFile);
  assert.ok(logs.some((line) => line.includes('Restauração aplicada')));
});

test('restauração agendada adulterada é descartada e o banco atual continua', async (t) => {
  const w = await workspace(t);
  const adapter = adapterFor(w.database);
  const point = await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter, kind: 'manual' });
  await setNote(w.database, 'atual');
  const verified = await core.verifyRestorePoint(w.backups, point.id, adapter);
  await core.stagePendingRestore({ dir: w.backups, database: verified.database, key: verified.key, source: 'restore_point', sourceRestorePointId: point.id, safetyRestorePointId: null, schemaVersion: point.schemaVersion });
  const pendingFile = paths.pendingRestoreFiles(w.backups).database;
  const bytes = await readFile(pendingFile);
  bytes[200] ^= 0xff;
  await writeFile(pendingFile, bytes);

  const result = await startup.applyPendingRestore(w.openPaths, KEY, MIGRATIONS, () => {});
  assert.equal(result.status, 'rejected');
  assert.equal(await readNote(w.database), 'atual');
  assert.equal(existsSync(paths.pendingRestoreFiles(w.backups).manifest), false);
});

test('cópia de versão desconhecida pelo aplicativo não é aplicada', async (t) => {
  const w = await workspace(t);
  const future = join(w.root, 'futuro.db');
  await createDatabase(future, [...MIGRATIONS, '20990101000000_future'], { note: 'futuro' });
  await core.stagePendingRestore({ dir: w.backups, database: future, key: null, source: 'encrypted_backup', sourceRestorePointId: null, safetyRestorePointId: null, schemaVersion: '20990101000000_future' });
  const result = await startup.applyPendingRestore(w.openPaths, KEY, MIGRATIONS, () => {});
  assert.equal(result.status, 'rejected');
  assert.equal(await readNote(w.database), 'original');
});

test('cancelar a restauração agendada apaga os arquivos e é idempotente', async (t) => {
  const w = await workspace(t);
  const point = await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter: adapterFor(w.database), kind: 'manual' });
  const verified = await core.verifyRestorePoint(w.backups, point.id, adapterFor(w.database));
  await core.stagePendingRestore({ dir: w.backups, database: verified.database, key: verified.key, source: 'restore_point', sourceRestorePointId: point.id, safetyRestorePointId: null, schemaVersion: point.schemaVersion });
  assert.equal(await core.cancelPendingRestore(w.backups), true);
  assert.equal(await core.cancelPendingRestore(w.backups), false);
  for (const file of Object.values(paths.pendingRestoreFiles(w.backups))) assert.equal(existsSync(file), false);
});

test('migration pendente gera ponto automático e registra DatabaseBackup', async (t) => {
  const w = await workspace(t);
  await mkdir(join(w.migrations, '20260301000000_third'));
  await writeFile(join(w.migrations, '20260301000000_third', 'migration.sql'), 'ALTER TABLE "X" ADD COLUMN "y" TEXT;');
  const { restorePoint, applied } = await w.prepare();
  assert.equal(restorePoint.kind, 'pre_migration');
  assert.equal(restorePoint.schemaVersion, MIGRATIONS.at(-1));
  assert.deepEqual(applied, ['20260301000000_third'], 'a migration roda depois do ponto');
  await assertEncryptedAtRest(paths.restorePointFile(w.backups, restorePoint.id, 'sqlite'));
  const database = open(w.database);
  const rows = (await database.execute('SELECT id, status, kind, checksum FROM DatabaseBackup')).rows;
  database.close();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, restorePoint.id);
  assert.equal(rows[0].status, 'verified');
  assert.equal(rows[0].kind, 'pre_migration');
  assert.equal(rows[0].checksum, restorePoint.sha256);
});

test('VACUUM INTO do libSQL grava a cópia em claro: o adaptador não usa', async (t) => {
  // Trava o motivo de libsql-file.ts copiar pela conexão cifrada. Se um dia o
  // libSQL passar a cifrar VACUUM INTO, este teste avisa e o atalho pode voltar.
  const w = await workspace(t);
  const vacuum = join(w.root, 'vacuum.db');
  const database = open(w.database);
  await database.execute({ sql: 'VACUUM INTO ?', args: [vacuum] });
  database.close();
  assert.equal((await readFile(vacuum)).includes(Buffer.from(MARKER)), true);
  await assertEncryptedAtRest(w.database);
});

test('cópia com outra chave, em claro ou arquivo qualquer não passa na inspeção nem é aplicada', async (t) => {
  const w = await workspace(t);
  const otherKey = join(w.root, 'outra-chave.db');
  const database = createClient({ url: `file:${otherKey}`, encryptionKey: 'cd'.repeat(32) });
  await database.execute('CREATE TABLE t (x TEXT)');
  database.close();
  const plaintext = join(w.root, 'claro.db');
  const plain = createClient({ url: `file:${plaintext}` });
  await plain.execute('CREATE TABLE t (x TEXT)');
  plain.close();
  for (const file of [otherKey, plaintext]) assert.deepEqual(await files.inspectDatabaseFile(file, KEY), { integrityOk: false, migrations: [] });

  const garbage = join(w.root, 'lixo.bin');
  await writeFile(garbage, Buffer.alloc(8192, 3));
  await core.stagePendingRestore({ dir: w.backups, database: garbage, key: null, source: 'restore_point', sourceRestorePointId: null, safetyRestorePointId: null, schemaVersion: MIGRATIONS.at(-1) });
  const result = await startup.applyPendingRestore(w.openPaths, KEY, MIGRATIONS, () => {});
  assert.equal(result.status, 'rejected');
  assert.equal(await readNote(w.database), 'original');
});

test('pontos e restauração agendada em claro de antes do cofre viram cópias cifradas', async (t) => {
  const w = await workspace(t);
  const point = await core.createRestorePoint({ dir: w.backups, keyPath: w.key, adapter: adapterFor(w.database), kind: 'manual' });
  // Simula um ponto antigo: troca a cópia por um banco em claro com o mesmo conteúdo.
  const file = paths.restorePointFile(w.backups, point.id, 'sqlite');
  const legacy = join(w.root, 'legado.db');
  const plain = createClient({ url: `file:${legacy}` });
  await plain.executeMultiple(`CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY, checksum TEXT, finished_at DATETIME, migration_name TEXT, logs TEXT, rolled_back_at DATETIME, started_at DATETIME, applied_steps_count INTEGER);
    CREATE TABLE Note (value TEXT); INSERT INTO Note VALUES ('${MARKER}');
    INSERT INTO _prisma_migrations VALUES ('a','x',1,'${MIGRATIONS[0]}',NULL,NULL,1,1), ('b','x',1,'${MIGRATIONS[1]}',NULL,NULL,1,1);`);
  plain.close();
  await writeFile(file, await readFile(legacy));
  const removed = [];
  assert.equal(await startup.encryptLegacyBackups(w.backups, KEY, async (target) => { removed.push(target); await rm(target, { force: true }); }), 1);
  assert.deepEqual(removed, [file], 'o arquivo em claro sai pela remoção segura');
  await assertEncryptedAtRest(file);
  const verified = await core.verifyRestorePoint(w.backups, point.id, adapterFor(w.database));
  assert.deepEqual(verified.migrations, MIGRATIONS, 'o manifesto passa a descrever a cópia cifrada');
  assert.equal(await startup.encryptLegacyBackups(w.backups, KEY, async () => {}), 0, 'repetir não faz nada');
});

test('sem migration pendente, a abertura não cria ponto', async (t) => {
  const w = await workspace(t);
  const { restorePoint } = await w.prepare();
  assert.equal(restorePoint, null);
  assert.deepEqual(await core.listRestorePoints(w.backups), []);
});

test('migration destrutiva segue liberada só com o ponto automático verificado', async (t) => {
  const w = await workspace(t);
  await mkdir(join(w.migrations, '20260301000000_drop'));
  await writeFile(join(w.migrations, '20260301000000_drop', 'migration.sql'), 'DROP TABLE "Note";');
  const { restorePoint, applied } = await w.prepare();
  assert.ok(restorePoint, 'o ponto verificado é o backup exigido pela migration destrutiva');
  assert.deepEqual(applied, ['20260301000000_drop']);
});

test('migration destrutiva sem ponto automático continua bloqueada', async (t) => {
  const w = await workspace(t);
  await mkdir(join(w.migrations, '20260301000000_drop'));
  await writeFile(join(w.migrations, '20260301000000_drop', 'migration.sql'), 'DROP TABLE "Note";');
  // Sem pasta de backups gravável, o ponto não sai; a trava exige TALENTUM_VERIFIED_BACKUP_ID.
  await writeFile(w.backups, 'não é pasta');
  await assert.rejects(w.prepare({ verifiedBackupId: null }), { code: 'DESTRUCTIVE_MIGRATION_BLOCKED' });
  assert.equal(await readNote(w.database), 'original');
});
