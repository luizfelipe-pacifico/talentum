import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseBrlToCents } from '../src/lib/format.ts';

/* Lançamento rápido em dinheiro (MVP 5 de docs/ROADMAP.md): código de ação,
   validação no backend, idempotência, evento no histórico e reversão. */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('o valor digitado em reais vira centavos sem arredondar', () => {
  assert.equal(parseBrlToCents('12'), '1200');
  assert.equal(parseBrlToCents('12,5'), '1250');
  assert.equal(parseBrlToCents('R$ 1.234,56'), '123456');
  assert.equal(parseBrlToCents('0,07'), '7');
  for (const invalid of ['', '0', '0,00', '12,345', 'abc', '-5', '1,2,3', '12.34', '1.23,00'])
    assert.equal(parseBrlToCents(invalid), null, invalid);
});

test('a rota valida tudo no backend e exige código de ação e perfil', async () => {
  const route = await read('src/app/api/transactions/route.ts');
  const post = route.slice(route.indexOf('export async function POST'));
  assert.match(post, /guardWithProfile\(request\)/);
  assert.match(route, /idempotencyKey: z\.string\(\)\.uuid\(\)/);
  assert.match(route, /amountCents: z\.string\(\)\.regex\(\/\^-\?\\d\{1,13\}\$\/\)\.refine\(\(value\) => BigInt\(value\) !== 0n\)/);
  assert.match(route, /if \(date > today\) return null;/, 'data no futuro é recusada');
  assert.match(route, /\.strict\(\)/);
});

test('o lançamento é idempotente, só vai para conta Dinheiro e é reversível', async () => {
  const service = await read('src/server/manual-entries.ts');
  assert.match(service, /if \(account\.type !== 'cash'\) throw new ManualEntryError\('ACCOUNT_NOT_CASH'\)/);
  assert.match(service, /if \(!sameRequest\(stored, input\)\) throw new ManualEntryError\('IDEMPOTENCY_KEY_REUSED'\)/);
  assert.match(service, /prismaErrorKind\(error\) === 'conflict'[\s\S]{0,120}replay\(profileId, input\)/, 'envio simultâneo devolve o vencedor');
  assert.match(service, /kind: 'manual_entry'[\s\S]{0,400}reversible: true/);
  assert.match(service, /importBatchId: null, idempotencyKey: \{ not: null \}/, 'a reversão só apaga lançamento manual');
  assert.match(service, /MANUAL_ENTRY_PAIRED/);
  const schema = await read('prisma/schema.prisma');
  assert.match(schema, /@@unique\(\[profileId, idempotencyKey\]\)/);
  const revert = await read('src/app/api/timeline-events/[timelineEventId]/revert/route.ts');
  assert.match(revert, /event\.kind==='manual_entry'&&event\.transactionId\)\{await revertManualEntry\(/);
});

test('a folha usa só a API local, gera a chave uma vez por formulário e oferece desfazer', async () => {
  const ui = await read('src/components/cash-entry.tsx');
  assert.match(ui, /postJson<[^>]*>\('\/api\/transactions'/);
  assert.match(ui, /idempotencyKey: key/);
  assert.match(ui, /const newKey = \(\) => crypto\.randomUUID\(\)/);
  assert.match(ui, /setKey\(newKey\(\)\)/, 'novo formulário, nova chave');
  assert.match(ui, /\/api\/timeline-events\/\$\{saved\.timelineEventId\}\/revert/);
  assert.doesNotMatch(ui, /@prisma|server\/db|demo-data/);
  const overlays = await read('src/components/overlays.tsx');
  assert.match(overlays, /app\.overlay === 'express' && <CashEntryDialog\/>/);
});
