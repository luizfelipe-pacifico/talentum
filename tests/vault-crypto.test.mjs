import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

/* Primitivas do cofre local: KDF, envelope da chave, código de recuperação,
   política de senha e TOTP (RFC 6238). docs/decisions/0009-local-vault-and-encrypted-database.md */

const root = new URL('../', import.meta.url);
const crypto = await import(new URL('src/server/vault/crypto.ts', root).href);
const totp = await import(new URL('src/server/vault/totp.ts', root).href);
const policy = await import(new URL('src/lib/password-policy.ts', root).href);

// Parâmetros reduzidos só para o teste ficar rápido; o cofre grava os padrões.
const FAST = { name: 'scrypt', N: 2 ** 10, r: 8, p: 1, keyLength: 32 };

test('scrypt usa os parâmetros documentados por padrão', () => {
  assert.deepEqual(crypto.DEFAULT_KDF, { name: 'scrypt', N: 131072, r: 8, p: 1, keyLength: 32 });
});

test('a DEK embrulhada pela senha volta igual e senha errada não abre', async () => {
  const dek = randomBytes(32);
  const salt = randomBytes(16);
  const kek = await crypto.deriveKek('frase longa sintética', salt, FAST);
  const wrapped = crypto.seal(dek, kek, 'aad-teste');
  assert.ok(crypto.open(wrapped, kek, 'aad-teste').equals(dek));

  const wrong = await crypto.deriveKek('frase longa sintetica', salt, FAST);
  assert.equal(crypto.open(wrapped, wrong, 'aad-teste'), null, 'outra senha');
  assert.equal(crypto.open(wrapped, kek, 'outro-proposito'), null, 'AAD diferente');
  const tampered = { ...wrapped, ciphertext: Buffer.from(Buffer.from(wrapped.ciphertext, 'base64').map((byte, index) => (index === 0 ? byte ^ 1 : byte))).toString('base64') };
  assert.equal(crypto.open(tampered, kek, 'aad-teste'), null, 'conteúdo alterado');
});

test('código de recuperação tem 160 bits, é legível e aceita variações de digitação', () => {
  const code = crypto.generateRecoveryCode();
  assert.match(code, /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
  const canonical = crypto.canonicalRecoveryCode(code);
  assert.equal(canonical.length, 32);
  assert.equal(crypto.canonicalRecoveryCode(code.toLowerCase().replaceAll('-', ' ')), canonical);
  assert.equal(crypto.canonicalRecoveryCode('0000-0000'), null);
  assert.equal(crypto.canonicalRecoveryCode('OIL0'.repeat(8)), '0110'.repeat(8), 'O vira 0; I e L viram 1');
  assert.notEqual(crypto.generateRecoveryCode(), code);
});

test('subchaves por finalidade são diferentes entre si e da DEK', () => {
  const dek = randomBytes(32);
  const keys = ['database', 'totp-secret', 'mfa-backup'].map((purpose) => crypto.subkey(dek, purpose).toString('hex'));
  assert.equal(new Set([...keys, dek.toString('hex')]).size, 4);
});

test('política de senha: mínimo de 12, lista de comuns e sequências', () => {
  assert.equal(policy.assessPassword('curta').acceptable, false);
  assert.deepEqual(policy.assessPassword('curta').problems, ['TOO_SHORT']);
  assert.ok(policy.assessPassword('senha1234567').problems.includes('COMMON'));
  assert.ok(policy.assessPassword('PASSWORD1234').problems.includes('COMMON'), 'comparação sem caixa');
  assert.ok(policy.assessPassword('aaaaaaaaaaaaaaa').problems.includes('REPETITIVE'));
  assert.ok(policy.assessPassword('abcdefghijklmnop').problems.includes('REPETITIVE'));
  const good = policy.assessPassword('cavalo bateria grampo correto');
  assert.equal(good.acceptable, true);
  assert.equal(good.label, 'Forte');
  assert.equal(policy.assessPassword('a'.repeat(300)).acceptable, false);
  assert.equal(policy.normalizePassword('café'), policy.normalizePassword('café'), 'NFKC une as formas do acento');
});

test('TOTP confere os vetores do RFC 6238 (SHA-1, 8 dígitos)', () => {
  const secret = Buffer.from('12345678901234567890', 'ascii');
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [seconds, expected] of vectors) assert.equal(totp.hotp(secret, Math.floor(seconds / 30), 8), expected, String(seconds));
});

test('TOTP aceita o passo anterior e o seguinte, e recusa reuso do mesmo passo', () => {
  const secret = totp.generateTotpSecret();
  const now = 1_800_000_000_000;
  const step = totp.totpStep(now);
  const code = totp.hotp(secret, step);
  assert.equal(totp.verifyTotp(secret, code, now, null), step);
  assert.equal(totp.verifyTotp(secret, totp.hotp(secret, step - 1), now, null), step - 1);
  assert.equal(totp.verifyTotp(secret, totp.hotp(secret, step + 1), now, null), step + 1);
  assert.equal(totp.verifyTotp(secret, totp.hotp(secret, step - 2), now, null), null, 'fora da janela');
  assert.equal(totp.verifyTotp(secret, code, now, step), null, 'mesmo passo já usado');
  assert.equal(totp.verifyTotp(secret, totp.hotp(secret, step - 1), now, step), null, 'passo anterior ao usado');
  assert.equal(totp.verifyTotp(secret, 'abcdef', now, null), null);
});

test('Base32 ida e volta e URI sem dado pessoal', () => {
  const secret = randomBytes(20);
  const encoded = totp.base32Encode(secret);
  assert.match(encoded, /^[A-Z2-7]{32}$/);
  assert.ok(totp.base32Decode(encoded).equals(secret));
  const uri = totp.otpauthUri(encoded);
  assert.match(uri, /^otpauth:\/\/totp\/Talentum%3ACofre%20local\?secret=[A-Z2-7]+&issuer=Talentum&algorithm=SHA1&digits=6&period=30$/);
});
