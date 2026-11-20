import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* L-4 de docs/PRODUCT.md: veredito e projeção divergiam com uma conta em outra
   moeda. `GET /api/dashboard` somava os centavos de todas as contas ativas,
   enquanto a projeção (`loadConsolidatedBalance`) ficava só com BRL. Somar
   centavos de moedas diferentes sem cotação produz um número falso; a direção
   documentada é filtrar as duas pela mesma moeda de referência e dizer quantas
   contas ficaram de fora. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const metrics = await import(new URL('src/server/dashboard-metrics.ts', root).href);

test('a moeda de referência separa as contas que entram no saldo', () => {
  assert.equal(metrics.REFERENCE_CURRENCY, 'BRL');
  const { included, excludedCount } = metrics.splitByReferenceCurrency([
    { id: 'a', currency: 'BRL' },
    { id: 'b', currency: 'USD' },
    { id: 'c', currency: 'BRL' },
  ]);
  assert.deepEqual(included.map((account) => account.id), ['a', 'c']);
  assert.equal(excludedCount, 1);
});

test('veredito e projeção leem o mesmo saldo consolidado', async () => {
  const dashboard = await read('src/app/api/dashboard/route.ts');
  const projection = await read('src/app/api/dashboard/risk-free-balance/route.ts');
  for (const [name, source] of [['dashboard', dashboard], ['projeção', projection]]) {
    assert.match(source, /loadConsolidatedBalance\(/, name);
    assert.match(source, /accountsInOtherCurrency/, name);
  }
  // Nenhuma soma de saldo própria sobra na rota do veredito.
  assert.doesNotMatch(dashboard, /consolidatedBalance\(/);
  const queries = await read('src/server/dashboard-queries.ts');
  assert.match(queries, /splitByReferenceCurrency\(/);
  assert.doesNotMatch(queries, /currency: 'BRL'/, 'a moeda vem da constante única, não de um literal');
});

test('a tela diz quantas contas em outra moeda ficaram fora do saldo', async () => {
  const view = await read('src/components/dashboard.tsx');
  assert.match(view, /accountsInOtherCurrency > 0/);
});
