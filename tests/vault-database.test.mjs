import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/* Cofre local e banco cifrado de ponta a ponta, sem servidor HTTP:
   configuração, cifragem real do arquivo, migrations, migração do banco antigo
   em claro, desbloqueio, atraso progressivo, recuperação, troca de senha,
   autenticador e bloqueio automático.

   Tudo roda num diretório temporário com dados sintéticos; nada toca no banco
   de quem está desenvolvendo. */

const root = new URL('../', import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'talentum-vault-'));
const databaseFile = join(directory, 'talentum-local.db');
process.env.DATABASE_URL = `file:${databaseFile}`;
process.env.TALENTUM_MIGRATIONS_DIR = resolve(new URL('prisma/migrations', root).pathname);

const service = await import(new URL('src/server/vault/service.ts', root).href);
const database = await import(new URL('src/server/vault/database.ts', root).href);
const session = await import(new URL('src/server/vault/session.ts', root).href);
const vaultFile = await import(new URL('src/server/vault/vault-file.ts', root).href);
const migrations = await import(new URL('src/server/vault/migrations.ts', root).href);
const totp = await import(new URL('src/server/vault/totp.ts', root).href);
const { createClient } = await import('@libsql/client');

const PASSWORD = 'frase sintética de teste do cofre';
const MARKER = 'MARCADOR_SINTETICO_EM_CLARO_7f3a';

test.after(async () => {
  await service.lockVault();
  await rm(directory, { recursive: true, force: true });
});

async function header(path) {
  const bytes = await readFile(path);
  return bytes.subarray(0, 16).toString('latin1');
}

let recoveryCode;

test('banco antigo em claro é migrado para o banco cifrado e o original some', async () => {
  // Banco criado pelo Prisma nativo, como o de quem já usava o Talentum.
  execFileSync(process.execPath, [resolve(new URL('node_modules/prisma/build/index.js', root).pathname), 'migrate', 'deploy'], {
    cwd: new URL('.', root).pathname,
    env: { ...process.env, DATABASE_URL: `file:${databaseFile}` },
    stdio: 'ignore',
  });
  const { PrismaClient } = await import('@prisma/client');
  const legacy = new PrismaClient({ datasourceUrl: `file:${databaseFile}` });
  const profile = await legacy.localProfile.create({ data: { displayName: MARKER } });
  const account = await legacy.account.create({ data: { profileId: profile.id, name: 'Conta sintética', type: 'checking' } });
  await legacy.balanceSnapshot.create({ data: { accountId: account.id, balanceCents: 999999999999999n, capturedAt: new Date('2026-01-02T03:04:05.678Z') } });
  await legacy.$disconnect();
  assert.equal(await header(databaseFile), 'SQLite format 3\0');

  const status = await service.vaultStatus(false);
  assert.deepEqual(status, { state: 'uninitialized', totpEnabled: false, retryAfterSeconds: 0, hasExistingData: true });

  const result = await service.setupVault(PASSWORD);
  recoveryCode = result.recoveryCode;
  assert.equal(result.migratedExistingData, true);
  assert.ok(session.sessionIsValid(result.sessionToken));

  // O arquivo não tem mais o cabeçalho do SQLite nem o texto marcador: está cifrado.
  assert.notEqual(await header(databaseFile), 'SQLite format 3\0');
  assert.equal(await database.fileContains(databaseFile, MARKER), false);
  const left = await readdir(directory);
  assert.ok(!left.some((name) => name.includes('plaintext') || name.includes('encrypting')), `sobras: ${left.join(', ')}`);

  // Sem a chave, o arquivo não abre.
  const raw = createClient({ url: `file:${databaseFile}` });
  await assert.rejects(raw.execute('SELECT count(*) FROM LocalProfile'), /NOTADB|not a database/i);
  raw.close();

  // Com o cofre aberto, os dados antigos estão lá com tipos intactos.
  const prisma = database.currentPrisma();
  const migrated = await prisma.localProfile.findFirst({ where: { displayName: MARKER } });
  assert.ok(migrated);
  const snapshot = await prisma.balanceSnapshot.findFirst();
  assert.equal(snapshot.balanceCents, 999999999999999n);
  assert.equal(snapshot.capturedAt.toISOString(), '2026-01-02T03:04:05.678Z');
  const negative = await prisma.balanceSnapshot.create({ data: { accountId: snapshot.accountId, balanceCents: -999999999999999n, capturedAt: new Date('2026-02-01T00:00:00.000Z') } });
  assert.equal((await prisma.balanceSnapshot.findUnique({ where: { id: negative.id } })).balanceCents, -999999999999999n);
  const inTransaction = await prisma.$transaction(async (tx) => tx.balanceSnapshot.count({ where: { capturedAt: { gte: new Date('2026-01-15T00:00:00Z') } } }));
  assert.equal(inTransaction, 1);
});

test('o arquivo do cofre fica fora do banco, com modo 0600 e sem segredo em claro', async () => {
  const path = vaultFile.vaultPath();
  assert.equal(path, join(directory, 'talentum-local.vault'));
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
  const text = await readFile(path, 'utf8');
  assert.doesNotMatch(text, new RegExp(PASSWORD));
  assert.doesNotMatch(text, new RegExp(recoveryCode.replaceAll('-', '')));
  const vault = JSON.parse(text);
  assert.equal(vault.kdf.N, 131072);
  assert.equal(vault.recovery.confirmed, false);
});

test('repetir a configuração não cria um segundo cofre', async () => {
  await assert.rejects(service.setupVault(PASSWORD), (error) => error.code === 'VAULT_ALREADY_SET_UP');
});

test('com o cofre bloqueado, db recusa qualquer acesso e as sessões caem', async () => {
  const token = session.createSession();
  await service.lockVault();
  assert.equal(session.isUnlocked(), false);
  assert.equal(session.sessionIsValid(token), false);
  const { db, VaultLockedError } = await import(new URL('src/server/db.ts', root).href);
  assert.throws(() => db.localProfile, VaultLockedError);
  assert.throws(() => db.$transaction, (error) => error.code === 'VAULT_LOCKED');
  assert.equal(database.currentPrisma(), null);
});

test('senha errada não abre, e erros seguidos impõem espera que sobrevive no arquivo', async () => {
  const now = Date.now();
  for (let attempt = 1; attempt <= service.FREE_ATTEMPTS; attempt += 1) {
    await assert.rejects(service.unlockVault('senha errada sintética', undefined, now), (error) => error.code === 'INVALID_CREDENTIALS');
  }
  const vault = await vaultFile.readVault();
  assert.equal(vault.throttle.failures, service.FREE_ATTEMPTS);
  assert.ok(vault.throttle.nextAttemptAt > now, 'próxima tentativa adiada');
  // Mesmo a senha certa espera: o atraso vem antes de qualquer verificação.
  await assert.rejects(service.unlockVault(PASSWORD, undefined, now + 1000), (error) => error.code === 'UNLOCK_THROTTLED' && error.retryAfterSeconds > 0);
  assert.equal(service.throttleDelayMs(4), 0);
  assert.equal(service.throttleDelayMs(5), 30_000);
  assert.equal(service.throttleDelayMs(6), 60_000);
  assert.equal(service.throttleDelayMs(50), 3_600_000);

  // Passado o prazo, a senha certa abre e zera a contagem.
  const later = vault.throttle.nextAttemptAt + 1;
  const unlocked = await service.unlockVault(PASSWORD, undefined, later);
  assert.ok(session.sessionIsValid(unlocked.sessionToken, later));
  // Código nunca confirmado: o desbloqueio troca por um novo.
  assert.match(unlocked.recoveryCode, /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  assert.notEqual(unlocked.recoveryCode, recoveryCode);
  recoveryCode = unlocked.recoveryCode;
  assert.equal((await vaultFile.readVault()).throttle.failures, 0);
  await service.confirmRecoveryCode();
  assert.equal((await vaultFile.readVault()).recovery.confirmed, true);
});

test('bloqueio automático por inatividade derruba a sessão e tira a DEK da memória', async () => {
  const base = Date.now();
  await service.lockVault();
  const { sessionToken } = await service.unlockVault(PASSWORD, undefined, base);
  assert.equal(session.autoLockMinutes(), 10);
  session.recordActivity(base + 5 * 60_000);
  assert.ok(session.sessionIsValid(sessionToken, base + 14 * 60_000), 'atividade aos 5 minutos adia até os 15');
  assert.equal(session.sessionIsValid(sessionToken, base + 16 * 60_000), false);
  await new Promise((resolveWait) => setImmediate(resolveWait));
  assert.equal(session.isUnlocked(), false);
  assert.equal(database.currentPrisma(), null);
});

test('troca de senha reembrulha a DEK: a antiga para de funcionar e os dados continuam', async () => {
  await service.unlockVault(PASSWORD, undefined, Date.now());
  await assert.rejects(service.changePassword('senha atual errada', 'outra frase sintética longa'), (error) => error.code === 'INVALID_CREDENTIALS');
  await assert.rejects(service.changePassword(PASSWORD, 'curta'), (error) => error.code === 'WEAK_PASSWORD');
  await service.changePassword(PASSWORD, 'outra frase sintética longa');
  await service.lockVault();
  await assert.rejects(service.unlockVault(PASSWORD, undefined, Date.now()), (error) => error.code === 'INVALID_CREDENTIALS');
  await service.unlockVault('outra frase sintética longa', undefined, Date.now());
  assert.ok(await database.currentPrisma().localProfile.findFirst({ where: { displayName: MARKER } }));
});

test('código de recuperação abre o cofre, define senha nova e é trocado', async () => {
  await service.lockVault();
  await assert.rejects(service.recoverVault('0000-0000-0000-0000-0000-0000-0000-0000', PASSWORD, undefined, Date.now()), (error) => error.code === 'INVALID_CREDENTIALS');
  const recovered = await service.recoverVault(recoveryCode.toLowerCase(), PASSWORD, undefined, Date.now());
  assert.notEqual(recovered.recoveryCode, recoveryCode);
  assert.ok(session.sessionIsValid(recovered.sessionToken));
  await service.lockVault();
  await assert.rejects(service.recoverVault(recoveryCode, PASSWORD, undefined, Date.now()), (error) => error.code === 'INVALID_CREDENTIALS', 'o código usado deixou de valer');
  recoveryCode = recovered.recoveryCode;
  await service.unlockVault(PASSWORD, undefined, Date.now());
  await service.confirmRecoveryCode();
});

test('autenticador: cadastro, desbloqueio com código, reuso recusado e erro sem dizer qual fator falhou', async () => {
  const now = Date.now();
  const enrollment = await service.startTotpEnrollment(PASSWORD, now);
  const secret = totp.base32Decode(enrollment.secret);
  await assert.rejects(service.confirmTotpEnrollment('000000', now), (error) => error.code === 'INVALID_TOTP' || error.code === 'TOTP_NOT_PENDING');
  const step = totp.totpStep(now);
  const { backupCodes } = await service.confirmTotpEnrollment(totp.hotp(secret, step), now);
  assert.equal(backupCodes.length, 10);
  const stored = await vaultFile.readVault();
  assert.equal(JSON.stringify(stored).includes(enrollment.secret), false, 'segredo do autenticador só cifrado');
  assert.equal((await service.vaultStatus(false)).totpEnabled, true);

  await service.lockVault();
  const later = now + 30_000;
  const code = totp.hotp(secret, totp.totpStep(later));
  // Sem código, com código errado ou com senha errada: o mesmo erro.
  for (const [password, attempt] of [[PASSWORD, undefined], [PASSWORD, '123456'], ['senha errada sintética', code]]) {
    await assert.rejects(service.unlockVault(password, attempt, later), (error) => error.code === 'INVALID_CREDENTIALS');
  }
  await service.unlockVault(PASSWORD, code, later);
  await service.lockVault();
  await assert.rejects(service.unlockVault(PASSWORD, code, later + 1000), (error) => error.code === 'INVALID_CREDENTIALS', 'mesmo código não vale duas vezes');

  // Código reserva funciona uma vez.
  await service.unlockVault(PASSWORD, backupCodes[0], later + 2000);
  await service.lockVault();
  await assert.rejects(service.unlockVault(PASSWORD, backupCodes[0], later + 3000), (error) => error.code === 'INVALID_CREDENTIALS');
  await service.unlockVault(PASSWORD, backupCodes[1].toLowerCase(), later + 4000);
  assert.equal((await service.securitySettings()).backupCodesRemaining, 8);

  // Desativar pede senha e código.
  const disableAt = later + 60_000;
  await service.disableTotp(PASSWORD, totp.hotp(secret, totp.totpStep(disableAt)), disableAt);
  assert.equal((await service.vaultStatus(false)).totpEnabled, false);
});

test('bloqueio automático configurável de 1 a 60 minutos', async () => {
  await assert.rejects(service.updateAutoLock(0));
  await assert.rejects(service.updateAutoLock(61));
  await service.updateAutoLock(1);
  assert.equal(session.autoLockMinutes(), 1);
  assert.equal((await vaultFile.readVault()).settings.autoLockMinutes, 1);
  await service.updateAutoLock(10);
});

test('executor de migrations é idempotente e registra no formato do Prisma', async () => {
  const dek = Buffer.alloc(32, 7);
  const path = join(directory, 'migrations-only.db');
  const client = database.openEncryptedClient(path, dek);
  const files = await migrations.readMigrations();
  const first = await migrations.applyMigrations(client, files);
  assert.equal(first.length, files.length);
  assert.deepEqual(await migrations.applyMigrations(client, files), [], 'segunda execução não aplica nada');
  const rows = await client.execute('SELECT migration_name, checksum, finished_at, applied_steps_count FROM "_prisma_migrations" ORDER BY migration_name');
  assert.deepEqual(rows.rows.map((row) => row.migration_name), files.map((file) => file.name));
  for (const [index, row] of rows.rows.entries()) {
    assert.equal(row.checksum, files[index].checksum);
    assert.notEqual(row.finished_at, null);
    assert.equal(Number(row.applied_steps_count), 1);
  }
  // Pasta nova (como as que outras mudanças acrescentam) é aplicada sem lista fixa.
  const extra = { name: '99990101000000_teste_sintetico', sql: 'CREATE TABLE "SinteticoTeste" ("id" TEXT NOT NULL PRIMARY KEY);', checksum: 'x'.repeat(64) };
  assert.deepEqual(await migrations.applyMigrations(client, [...files, extra]), [extra.name]);
  // Migration destrutiva com dados aplicados exige backup verificado.
  const destructive = { name: '99990102000000_destrutiva', sql: 'DROP TABLE "SinteticoTeste";', checksum: 'y'.repeat(64) };
  await assert.rejects(migrations.applyMigrations(client, [...files, extra, destructive], { verifiedBackupId: null }), (error) => error.code === 'DESTRUCTIVE_MIGRATION_BLOCKED');
  // Migration que falha no meio bloqueia as seguintes.
  const broken = { name: '99990103000000_quebrada', sql: 'CREATE TABLE x (;', checksum: 'z'.repeat(64) };
  await assert.rejects(migrations.applyMigrations(client, [...files, extra, broken]), (error) => error.code === 'MIGRATION_FAILED');
  await assert.rejects(migrations.applyMigrations(client, [...files, extra, broken]), (error) => error.code === 'FAILED_MIGRATION_PENDING');
  client.close();
  assert.notEqual(await header(path), 'SQLite format 3\0');
});
