import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pixKeyCandidates, TRANSFER_WINDOW_DAYS, transferCandidates } from '../src/server/transfer-detection.ts';

/* Detecção de transferência entre contas próprias (L-5 de docs/PRODUCT.md).
   Valores, chaves e contas sintéticos. */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const entry = (over) => ({ id: 'x', accountId: 'a', occurredOn: new Date(2026, 8, 10), amountCents: -10_000n, ...over });

test('par exige mesmo valor com sinal oposto, em outra conta, dentro da janela', () => {
  const target = entry({ id: 'saida' });
  const pool = [
    entry({ id: 'mesmo-dia', accountId: 'b', amountCents: 10_000n }),
    entry({ id: 'dia-seguinte', accountId: 'c', amountCents: 10_000n, occurredOn: new Date(2026, 8, 11) }),
    entry({ id: 'mesma-conta', accountId: 'a', amountCents: 10_000n }),
    entry({ id: 'mesmo-sinal', accountId: 'b', amountCents: -10_000n }),
    entry({ id: 'outro-valor', accountId: 'b', amountCents: 9_999n }),
    entry({ id: 'longe', accountId: 'b', amountCents: 10_000n, occurredOn: new Date(2026, 8, 10 + TRANSFER_WINDOW_DAYS + 1) }),
  ];
  const result = transferCandidates(target, pool);
  assert.deepEqual(result.map((candidate) => candidate.transactionId), ['mesmo-dia', 'dia-seguinte']);
  assert.equal(result[0].confidence, 80);
  assert.equal(result[1].confidence, 70);
});

test('chave PIX própria na descrição é a evidência mais forte', () => {
  const target = entry({ id: 'saida', mentionsOwnPix: true });
  const [candidate] = transferCandidates(target, [entry({ id: 'entrada', accountId: 'b', amountCents: 10_000n, occurredOn: new Date(2026, 8, 12) })]);
  assert.equal(candidate.ownPix, true);
  assert.equal(candidate.confidence, 80, 'dois dias de distância com chave própria');
  assert.deepEqual(transferCandidates(entry({ amountCents: 0n }), [entry({ id: 'zero', accountId: 'b', amountCents: 0n })]), []);
});

test('trechos com forma de chave PIX são extraídos e normalizados; mascarados não', () => {
  const found = pixKeyCandidates('PIX ENVIADO pessoa.sintetica@exemplo.com.br (11) 90000-0001 12.345.678/0001-90');
  const keys = found.map((candidate) => `${candidate.type}:${candidate.normalized}`);
  assert.ok(keys.includes('email:pessoa.sintetica@exemplo.com.br'));
  assert.ok(keys.includes('phone:+5511900000001'));
  assert.ok(keys.includes('cnpj:12345678000190'));
  assert.ok(!keys.some((key) => key.startsWith('cpf:12345678000')), 'CNPJ não é lido também como CPF');
  const elevenDigits = pixKeyCandidates('TRANSF 123.456.789-09').map((candidate) => candidate.type);
  assert.deepEqual(elevenDigits.sort(), ['cpf', 'phone'], 'onze dígitos conferem como CPF e como celular');
  assert.deepEqual(pixKeyCandidates('PIX ***.456.789-** MASCARADO'), []);
  assert.deepEqual(pixKeyCandidates('chave 0f8fad5b-d9cb-469f-a165-70867728950e').map((candidate) => candidate.type), ['random']);
});

test('a comparação usa o índice HMAC e o valor em claro não sai da função', async () => {
  const auto = await read('src/server/auto-reconciliation.ts');
  assert.match(auto, /indexes\.has\(await pixIndexOf\(candidate\.type, candidate\.normalized\)\)/);
  assert.match(auto, /if \(indexes\.size === 0\) return false;/, 'sem chave cadastrada, nem deriva a chave do dispositivo');
  assert.doesNotMatch(auto, /console\./);
  const route = await read('src/app/api/reconciliation-items/[reconciliationItemId]/route.ts');
  assert.match(route, /rankTransfers\(target,pool\)/);
  assert.match(route, /outgoingTransfers:\{none:\{\}\},incomingTransfers:\{none:\{\}\}/, 'lançamento já pareado não é oferecido de novo');
  const ui = await read('src/components/reconciliation.tsx');
  assert.match(ui, /Possível transferência entre suas contas/);
  assert.match(ui, /kind:'transfer',counterpartTransactionId:best\.id/);
});
