import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DUE_SOON_DAYS, lastDataAt, localAlerts, STALE_AFTER_DAYS } from '../src/server/alerts.ts';

/* Alertas locais do Dashboard (MVP 6 de docs/ROADMAP.md). Datas e valores sintéticos. */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const now = new Date(2026, 10, 20, 15, 30);
const obligation = (id, day, month = 10) => ({ id, description: `Obrigação ${id}`, amountCents: 10_000n, dueDate: new Date(2026, month, day, 12), isEstimated: false });
const account = (id, over = {}) => ({ id, name: `Conta ${id}`, lastBalanceAt: null, lastStatementAt: null, lastEntryAt: null, ...over });

test('vencidas e a vencer nos próximos dias viram alertas separados, em ordem', () => {
  const alerts = localAlerts({
    now,
    obligations: [obligation('hoje', 20), obligation('ontem', 19), obligation('antiga', 2), obligation('limite', 20 + DUE_SOON_DAYS), obligation('longe', 20 + DUE_SOON_DAYS + 1)],
    accounts: [],
  });
  const overdue = alerts.find((alert) => alert.kind === 'obligation_overdue');
  const soon = alerts.find((alert) => alert.kind === 'obligation_due_soon');
  assert.deepEqual(overdue.obligations.map((item) => item.id), ['antiga', 'ontem']);
  assert.equal(overdue.severity, 'danger');
  assert.deepEqual(soon.obligations.map((item) => item.id), ['hoje', 'limite'], 'vence hoje conta como em breve, não como vencida');
});

test('vencimento no mês seguinte também é "em breve"', () => {
  const lastDay = new Date(2026, 10, 30, 9);
  const alerts = localAlerts({ now: lastDay, obligations: [obligation('virada', 2, 11)], accounts: [] });
  assert.equal(alerts[0].kind, 'obligation_due_soon');
});

test('conta sem dado novo há mais de 30 dias é marcada; conta sem dado nenhum não', () => {
  const old = new Date(now.getFullYear(), now.getMonth(), now.getDate() - STALE_AFTER_DAYS - 1);
  const recent = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
  const alerts = localAlerts({
    now,
    obligations: [],
    accounts: [
      account('velha', { lastBalanceAt: old }),
      account('renovada', { lastBalanceAt: old, lastEntryAt: recent }),
      account('vazia'),
    ],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].kind, 'stale_data');
  assert.deepEqual(alerts[0].accounts.map((item) => item.id), ['velha']);
  assert.equal(lastDataAt(account('x', { lastStatementAt: old, lastEntryAt: recent })).getTime(), recent.getTime());
});

test('sem nada a avisar, a lista é vazia e a lista de cada alerta tem teto', () => {
  assert.deepEqual(localAlerts({ now, obligations: [], accounts: [] }), []);
  const many = Array.from({ length: 8 }, (_, index) => obligation(`o${index}`, 1 + index));
  const [overdue] = localAlerts({ now, obligations: many, accounts: [] });
  assert.equal(overdue.count, 8);
  assert.equal(overdue.obligations.length, 5);
});

test('o Dashboard recebe os alertas da API e os mostra com a ação seguinte', async () => {
  const route = await read('src/app/api/dashboard/route.ts');
  assert.match(route, /localAlerts\(\{ now, \.\.\.alertInputs \}\)/);
  assert.match(route, /amountCents: cents\(obligation\.amountCents\)/, 'centavos viajam como string');
  const view = await read('src/components/dashboard.tsx');
  assert.match(view, /<Alerts alerts=\{data\.alerts \?\? \[\]\}/);
  assert.match(view, /href="\/extratos\/recorrencias">Abrir obrigações/);
  assert.match(view, /onClick=\{onImport\}>Importar extrato/);
});
