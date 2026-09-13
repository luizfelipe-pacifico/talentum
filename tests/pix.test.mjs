import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* Identificadores PIX. Todos os valores são sintéticos e inventados para o
   teste: nenhum CPF, telefone ou e-mail real aparece aqui.

   A chave do dispositivo é criada num diretório temporário, para não tocar a
   chave de desenvolvimento nem deixar rastro. */

const keyDir = await mkdtemp(join(tmpdir(), 'talentum-pix-'));
process.env.TALENTUM_LOCAL_KEY_FILE = join(keyDir, 'teste.key');

const { localKeyPath, deriveKey } = await import('../src/server/local-key.ts');
const {
  normalizePixKey,
  maskPixKey,
  pixIndexOf,
  pixIndexEquals,
  encryptPixKey,
  decryptPixKey,
  preparePixKey,
  PixParseError,
} = await import('../src/server/pix.ts');

test.after(async () => {
  await rm(keyDir, { recursive: true, force: true });
});

test('a chave do dispositivo fica ao lado do banco, não dentro dele', () => {
  // Se o SQLite for copiado sozinho, os identificadores continuam ilegíveis.
  assert.equal(localKeyPath(), join(keyDir, 'teste.key'));
});

test('as subchaves por finalidade são distintas entre si', async () => {
  const index = await deriveKey('pix-index');
  const value = await deriveKey('pix-value');
  assert.equal(index.length, 32);
  assert.equal(value.length, 32);
  // Comprometer o índice de comparação não pode entregar a chave de cifragem.
  assert.ok(!index.equals(value));
});

test('normaliza CPF e CNPJ para dígitos', () => {
  assert.equal(normalizePixKey('cpf', '999.999.999-99'), '99999999999');
  assert.equal(normalizePixKey('cpf', '99999999999'), '99999999999');
  assert.equal(normalizePixKey('cnpj', '99.999.999/9999-99'), '99999999999999');
});

test('normaliza telefone para E.164, com ou sem código do país', () => {
  // É o que faz a mesma chave digitada de dois jeitos casar na comparação.
  const esperado = '+5511999999999';
  assert.equal(normalizePixKey('phone', '(11) 99999-9999'), esperado);
  assert.equal(normalizePixKey('phone', '11999999999'), esperado);
  assert.equal(normalizePixKey('phone', '+55 11 99999-9999'), esperado);
  assert.equal(normalizePixKey('phone', '5511999999999'), esperado);
});

test('normaliza e-mail para minúsculas', () => {
  // `example.com` é domínio reservado pela IANA para documentação: não existe
  // pessoa real por trás dele.
  assert.equal(normalizePixKey('email', '  Pessoa.Sintetica@Example.COM '), 'pessoa.sintetica@example.com');
});

test('normaliza chave aleatória para minúsculas', () => {
  const uuid = '3F2A9C11-4B8E-4D2A-9E77-0A1B2C3D4E5F';
  assert.equal(normalizePixKey('random', uuid), uuid.toLowerCase());
});

test('recusa chave que não corresponde ao tipo', () => {
  assert.throws(() => normalizePixKey('cpf', '123'), PixParseError);
  assert.throws(() => normalizePixKey('cnpj', '99999999999'), PixParseError);
  assert.throws(() => normalizePixKey('phone', '123'), PixParseError);
  assert.throws(() => normalizePixKey('email', 'sem-arroba'), PixParseError);
  assert.throws(() => normalizePixKey('random', 'nao-e-uuid'), PixParseError);
  assert.throws(() => normalizePixKey('cpf', ''), PixParseError);
});

test('a máscara mostra o suficiente para reconhecer e insuficiente para reconstruir', () => {
  /* Aqui os valores usam dígitos sequenciais em vez de repetidos: os dois são
     inequivocamente sintéticos — nenhum é um documento válido —, mas só os
     sequenciais permitem verificar *quais* posições foram ocultadas. */
  const cpf = maskPixKey('cpf', '12345678901');
  assert.ok(!cpf.includes('12345678'), 'os dígitos iniciais não podem aparecer');
  assert.ok(cpf.endsWith('901'.slice(-2)), 'os dois finais ficam visíveis para reconhecimento');

  const cnpj = maskPixKey('cnpj', '12345678000190');
  assert.ok(!cnpj.includes('12345678'), 'a raiz do CNPJ não pode aparecer');
  assert.ok(cnpj.endsWith('90'));

  const telefone = maskPixKey('phone', '+5511912345678');
  assert.ok(telefone.endsWith('5678'), 'os quatro finais ficam visíveis');
  assert.ok(!telefone.includes('91234'), 'o miolo do número é ocultado');

  const email = maskPixKey('email', 'pessoa.sintetica@example.com');
  assert.ok(email.startsWith('p'));
  assert.ok(email.endsWith('@example.com'), 'o domínio ajuda a reconhecer a conta');
  assert.ok(!email.includes('sintetica'), 'a parte local é ocultada');
});

test('o índice é determinístico e o mesmo valor normalizado casa', async () => {
  const a = await pixIndexOf('cpf', normalizePixKey('cpf', '999.999.999-99'));
  const b = await pixIndexOf('cpf', normalizePixKey('cpf', '99999999999'));
  assert.equal(a, b, 'a mesma chave escrita de dois jeitos precisa casar');
  assert.ok(pixIndexEquals(a, b));
});

test('o índice não é um hash simples do valor', async () => {
  // Um SHA-256 puro de CPF cai por força bruta: só existem 10^11 combinações.
  const { createHash } = await import('node:crypto');
  const normalized = '99999999999';
  const indice = await pixIndexOf('cpf', normalized);
  const hashSimples = createHash('sha256').update(normalized).digest('hex');
  const hashComTipo = createHash('sha256').update(`cpf:${normalized}`).digest('hex');
  assert.notEqual(indice, hashSimples);
  assert.notEqual(indice, hashComTipo);
});

test('o mesmo dígito em tipos diferentes não colide', async () => {
  const comoCpf = await pixIndexOf('cpf', '99999999999');
  const comoTelefone = await pixIndexOf('phone', '99999999999');
  assert.notEqual(comoCpf, comoTelefone);
});

test('a cifragem é reversível e traz versão, nonce e tag', async () => {
  const normalized = 'pessoa.sintetica@example.com';
  const payload = await encryptPixKey(normalized);
  const [version, iv, ciphertext, tag] = payload.split('.');
  assert.equal(version, 'v1');
  assert.ok(iv && ciphertext && tag);
  assert.equal(await decryptPixKey(payload), normalized);
});

test('cada cifragem usa nonce próprio', async () => {
  const a = await encryptPixKey('99999999999');
  const b = await encryptPixKey('99999999999');
  assert.notEqual(a, b, 'nonce repetido em AES-GCM quebra a confidencialidade');
});

test('conteúdo adulterado falha em vez de devolver lixo', async () => {
  const payload = await encryptPixKey('99999999999');
  const parts = payload.split('.');
  // Troca um caractere do texto cifrado.
  parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('A') ? 'B' : 'A');
  await assert.rejects(() => decryptPixKey(parts.join('.')));
  await assert.rejects(() => decryptPixKey('formato-invalido'));
});

test('preparePixKey entrega tudo o que a persistência precisa, sem texto puro', async () => {
  const prepared = await preparePixKey('cpf', '999.999.999-99');
  assert.equal(prepared.type, 'cpf');
  assert.match(prepared.valueIndex, /^[0-9a-f]{64}$/);
  assert.match(prepared.valueCiphertext, /^v1\./);
  assert.ok(!prepared.valueCiphertext.includes('99999999999'), 'o valor não pode aparecer em claro');
  assert.ok(!prepared.maskedValue.includes('99999999999'));
  assert.equal(await decryptPixKey(prepared.valueCiphertext), '99999999999');
});

test('tipo desconhecido é recusado', async () => {
  await assert.rejects(() => preparePixKey('cartao', '1234'), PixParseError);
});
