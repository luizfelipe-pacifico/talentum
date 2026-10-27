import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/* Regressões de honestidade dos números, encontradas no teste manual com dados
   sintéticos. A regra de fundo é a R-29 de docs/DASHBOARD.md: ausência só pode
   ser afirmada quando o backend confirmou. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const metrics = await import(new URL('src/server/dashboard-metrics.ts', root).href);
const chart = await import(new URL('src/lib/chart.ts', root).href);

test('o saldo consolidado informa a data-base do saldo mais antigo usado (R-26)', () => {
  const older = new Date(2026, 8, 1);
  const newer = new Date(2026, 9, 10);
  const result = metrics.consolidatedBalance(
    [
      { accountId: 'a', snapshot: { balanceCents: 100n, capturedAt: newer } },
      { accountId: 'b', snapshot: { balanceCents: 100n, capturedAt: older } },
      { accountId: 'c', snapshot: null },
    ],
    [],
  );
  assert.equal(result.referenceDate?.getTime(), older.getTime());
  assert.equal(metrics.consolidatedBalance([{ accountId: 'c', snapshot: null }], []).referenceDate, null);
});

test('o veredito sabe quantas obrigações são estimativas (L-1)', () => {
  const end = new Date(2026, 9, 31);
  const summary = metrics.committedSummary(
    [
      { amountCents: 1000n, dueDate: new Date(2026, 9, 5), status: 'open', isEstimated: true },
      { amountCents: 500n, dueDate: new Date(2026, 9, 6), status: 'open', isEstimated: false },
      { amountCents: 900n, dueDate: new Date(2026, 9, 6), status: 'paid', isEstimated: true },
    ],
    end,
  );
  assert.deepEqual(summary, { cents: 1500n, count: 2, estimatedCount: 1 });
});

test('a API do painel devolve data-base e estimativas, e a tela as mostra', async () => {
  const route = await read('src/app/api/dashboard/route.ts');
  assert.match(route, /balanceReferenceDate:/);
  assert.match(route, /committedEstimatedCount:/);
  const view = await read('src/components/dashboard.tsx');
  assert.match(view, /balanceReferenceDate/);
  assert.match(view, /committedEstimatedCount > 0/);
});

test('a barra de categoria mede a fatia do total, não a do maior grupo', () => {
  assert.equal(chart.shareOfTotal(18990n, 38080n), 49.9);
  assert.equal(chart.shareOfTotal(0n, 38080n), 0);
  assert.equal(chart.shareOfTotal(5n, 0n), 0);
});

test('o gráfico de categorias mostra erro com repetição em vez de sumir (R-28)', async () => {
  const view = await read('src/components/dashboard.tsx');
  assert.doesNotMatch(view, /const largest =/);
  assert.match(view, /shareOfTotal\(/);
  assert.doesNotMatch(view, /state\.status === 'error' \|\| !state\.payload\.hasProfile\) return null/);
  assert.match(view, /state\.status === 'error'[\s\S]{0,600}Tentar novamente/);
  const hook = await read('src/hooks/use-category-breakdown.ts');
  assert.match(hook, /retry/);
});

test('telas de área não afirmam "nenhum" sem consultar o backend', async () => {
  const pages = await read('src/components/demo-pages.tsx');
  for (const page of ['StatementsPage', 'RecurrencesPage', 'ReconciliationPage'])
    assert.match(pages, new RegExp(`function ${page}\\([^)]*\\)\\s*\\{[\\s\\S]{0,160}useLocalSummary\\(`), page);
  const nav = await read('src/lib/navigation.ts');
  assert.doesNotMatch(nav, /Nenhum item aguardando decisão/);
});

test('toda rota da API local exige código de ação e escopa por perfil', async () => {
  const dir = new URL('src/app/api/', root);
  const routes = (await readdir(dir, { recursive: true }))
    .map((entry) => entry.replaceAll('\\', '/'))
    .filter((entry) => entry.endsWith('route.ts') && !/^(action-codes|health)\//.test(entry));
  assert.ok(routes.includes('local-summary/route.ts'), 'resumo local existe');
  for (const route of routes) {
    const source = await read(`src/app/api/${route}`);
    assert.match(source, /consumeActionCode\(request\.headers\.get\('X-Action-Code'\)/, route);
    for (const clause of source.match(/where:\s*\{[^}]*\}/g) ?? []) assert.match(clause, /profileId|accountId: \{ in/, `${route}: ${clause}`);
  }
});

test('mês sem gastos mostra o estado vazio do gráfico em vez de sumir', async () => {
  const view = await read('src/components/dashboard.tsx');
  assert.doesNotMatch(view, /if \(total === 0n\) return null;/);
  assert.match(view, /total === 0n[\s\S]{0,400}Nenhum gasto confirmado neste período/);
});
