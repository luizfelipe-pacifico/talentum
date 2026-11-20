import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

/* Backup cifrado local (Stage 18, ADR 0007). Conteúdo e senhas sintéticos.
   Os testes usam N = 2^14 para rodar rápido; o arquivo registra os parâmetros
   no cabeçalho e o leitor aceita de 2^14 a 2^20. */

const backup = await import('../src/server/backup/encrypted.ts');
const FAST = { N: 2 ** 14, r: 8, p: 1 };
const PASS = 'senha sintética de teste longa';
const content = { schemaVersion: '20261120220000_notifications_gamification', database: randomBytes(4096), databaseKey: randomBytes(32), key: randomBytes(32) };

test('cifra e decifra com a mesma senha, levando banco e chave', async () => {
  const file = await backup.encryptBackup(content, PASS, { kdf: FAST });
  assert.ok(file.subarray(0, backup.MAGIC.length).equals(backup.MAGIC));
  const restored = await backup.decryptBackup(file, PASS);
  assert.equal(restored.schemaVersion, content.schemaVersion);
  assert.ok(restored.database.equals(content.database));
  assert.ok(restored.key.equals(content.key));
  assert.ok(restored.databaseKey.equals(content.databaseKey), 'a chave da cópia cifrada acompanha o banco');
});

test('o cabeçalho declara algoritmo, KDF, sal e nonce, e não vaza o conteúdo', async () => {
  const file = await backup.encryptBackup(content, PASS, { kdf: FAST });
  const { header } = backup.readHeader(file);
  assert.equal(header.alg, 'AES-256-GCM');
  assert.equal(header.kdf, 'scrypt');
  assert.equal(header.N, FAST.N);
  assert.equal(Object.keys(header).includes('databaseSha256'), false, 'o hash do banco fica cifrado');
  assert.equal(file.includes(content.database.subarray(0, 64)), false);
});

test('dois arquivos da mesma cópia usam sal e nonce diferentes', async () => {
  const a = backup.readHeader(await backup.encryptBackup(content, PASS, { kdf: FAST }));
  const b = backup.readHeader(await backup.encryptBackup(content, PASS, { kdf: FAST }));
  assert.notEqual(a.header.salt, b.header.salt);
  assert.notEqual(a.header.nonce, b.header.nonce);
});

test('senha errada não abre e não distingue de arquivo alterado', async () => {
  const file = await backup.encryptBackup(content, PASS, { kdf: FAST });
  await assert.rejects(backup.decryptBackup(file, 'outra senha sintética'), { code: 'WRONG_PASSPHRASE_OR_DAMAGED' });
  const tampered = Buffer.from(file);
  tampered[tampered.length - 40] ^= 0x01;
  await assert.rejects(backup.decryptBackup(tampered, PASS), { code: 'WRONG_PASSPHRASE_OR_DAMAGED' });
});

test('trocar parâmetro do cabeçalho invalida a autenticação', async () => {
  const file = await backup.encryptBackup(content, PASS, { kdf: FAST });
  const text = file.toString('latin1').replace('"p":1', '"p":2');
  await assert.rejects(backup.decryptBackup(Buffer.from(text, 'latin1'), PASS), { code: 'WRONG_PASSPHRASE_OR_DAMAGED' });
});

test('arquivo que não é backup e KDF abusivo são recusados antes de derivar', async () => {
  assert.throws(() => backup.readHeader(Buffer.from('não é um backup do Talentum, só texto qualquer')), { code: 'NOT_A_BACKUP' });
  const file = await backup.encryptBackup(content, PASS, { kdf: FAST });
  const huge = Buffer.from(file.toString('latin1').replace(`"N":${FAST.N}`, `"N":${2 ** 24}`), 'latin1');
  // O comprimento do cabeçalho mudou; corrige para isolar o teste do limite de N.
  const headerLength = file.readUInt32BE(backup.MAGIC.length) + String(2 ** 24).length - String(FAST.N).length;
  huge.writeUInt32BE(headerLength, backup.MAGIC.length);
  assert.throws(() => backup.readHeader(huge), { code: 'NOT_A_BACKUP' });
  const future = Buffer.from(file.toString('latin1').replace('"v":2', '"v":9'), 'latin1');
  assert.throws(() => backup.readHeader(future), { code: 'UNSUPPORTED_VERSION' });
  // A versão 1 levava o banco em claro dentro do arquivo: não é aceita.
  const legacy = Buffer.from(file.toString('latin1').replace('"v":2', '"v":1'), 'latin1');
  assert.throws(() => backup.readHeader(legacy), { code: 'UNSUPPORTED_VERSION' });
});

test('o banco dentro do backup não pode ir sem a chave da cópia', async () => {
  await assert.rejects(backup.encryptBackup({ ...content, databaseKey: Buffer.alloc(0) }, PASS, { kdf: FAST }), /DATABASE_KEY_INVALID/);
});

test('senha curta é recusada ao gerar', async () => {
  await assert.rejects(backup.encryptBackup(content, 'curta', { kdf: FAST }), { code: 'WEAK_PASSPHRASE' });
  assert.equal(backup.DEFAULT_KDF.N, 2 ** 17, 'o padrão segue o mínimo da OWASP para scrypt');
});
