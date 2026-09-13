import test from 'node:test';
import assert from 'node:assert/strict';
import { cashProjection, monthlyCashFlow } from '../src/server/dashboard-metrics.ts';

/* Fórmulas dos elementos G-1 e G-3 de docs/DASHBOARD.md.
   Todos os dados são sintéticos. */

const day = (year, month, date) => new Date(year, month - 1, date);
const obligation = (over = {}) => ({ amountCents: 10000n, dueDate: day(2026, 9, 15), status: 'open', ...over });
const tx = (over = {}) => ({
  accountId: 'a1',
  occurredOn: day(2026, 7, 10),
  amountCents: -1000n,
  status: 'posted',
  categoryId: null,
  categoryKind: 'expense',
  ...over,
});

/* ── G-1: projeção de caixa ─────────────────────────────────────── */

test('a projeção desconta cada obrigação no dia em que ela vence', () => {
  const result = cashProjection(
    50000n,
    [obligation({ amountCents: 20000n, dueDate: day(2026, 9, 12) })],
    day(2026, 9, 10),
    day(2026, 9, 14),
  );

  assert.equal(result.points.length, 5);
  assert.equal(result.points[0].balanceCents, 50000n, 'dia 10 sem vencimento');
  assert.equal(result.points[1].balanceCents, 50000n, 'dia 11 sem vencimento');
  assert.equal(result.points[2].balanceCents, 30000n, 'dia 12: o degrau');
  assert.equal(result.points[2].dueCents, 20000n);
  assert.equal(result.points[4].balanceCents, 30000n, 'segue plana até o fim');
  assert.equal(result.endingBalanceCents, 30000n);
});

test('aponta o primeiro dia em que o saldo fica negativo', () => {
  const result = cashProjection(
    10000n,
    [
      obligation({ amountCents: 6000n, dueDate: day(2026, 9, 11) }),
      obligation({ amountCents: 9000n, dueDate: day(2026, 9, 13) }),
    ],
    day(2026, 9, 10),
    day(2026, 9, 14),
  );

  assert.equal(result.shortfallDay, '2026-09-13');
  assert.equal(result.endingBalanceCents, -5000n);
});

test('sem obrigação a linha é plana e não há ruptura', () => {
  const result = cashProjection(50000n, [], day(2026, 9, 10), day(2026, 9, 12));
  assert.equal(result.shortfallDay, null);
  assert.ok(result.points.every((point) => point.balanceCents === 50000n));
});

test('obrigação já vencida antes da janela pesa no primeiro dia', () => {
  // Esconder o que já venceu deixaria a projeção otimista: a dívida continua.
  const result = cashProjection(
    50000n,
    [obligation({ amountCents: 15000n, dueDate: day(2026, 8, 30) })],
    day(2026, 9, 10),
    day(2026, 9, 12),
  );
  assert.equal(result.points[0].balanceCents, 35000n);
  assert.equal(result.points[0].dueCents, 15000n);
});

test('obrigação paga ou cancelada não entra na projeção', () => {
  const result = cashProjection(
    50000n,
    [
      obligation({ amountCents: 20000n, dueDate: day(2026, 9, 11), status: 'paid' }),
      obligation({ amountCents: 30000n, dueDate: day(2026, 9, 11), status: 'cancelled' }),
    ],
    day(2026, 9, 10),
    day(2026, 9, 12),
  );
  assert.equal(result.endingBalanceCents, 50000n);
});

test('obrigação além do fim do período não é descontada', () => {
  const result = cashProjection(
    50000n,
    [obligation({ amountCents: 20000n, dueDate: day(2026, 10, 5) })],
    day(2026, 9, 10),
    day(2026, 9, 30),
  );
  assert.equal(result.endingBalanceCents, 50000n, 'o horizonte é o período, não o futuro inteiro');
});

/* ── G-3: entradas e saídas por mês ─────────────────────────────── */

const coberturaDeJulho = [{ start: day(2026, 7, 1), end: new Date(2026, 6, 31, 23, 59, 59, 999) }];

test('agrega entradas e saídas por mês civil', () => {
  const meses = monthlyCashFlow(
    [
      tx({ occurredOn: day(2026, 7, 5), amountCents: 300000n, categoryKind: 'income' }),
      tx({ occurredOn: day(2026, 7, 20), amountCents: -50000n }),
      tx({ occurredOn: day(2026, 7, 25), amountCents: -20000n }),
    ],
    coberturaDeJulho,
  );

  assert.equal(meses.length, 1);
  assert.equal(meses[0].month, '2026-07');
  assert.equal(meses[0].incomeCents, 300000n);
  assert.equal(meses[0].expenseCents, 70000n);
  assert.equal(meses[0].netCents, 230000n);
  assert.equal(meses[0].coverage, 'full');
});

test('mês sem cobertura de extrato não é devolvido', () => {
  // Renderizá-lo como barra vazia afirmaria que não houve movimento, quando a
  // verdade é que não sabemos — a mentira de D-2 ao longo do eixo do tempo.
  const meses = monthlyCashFlow(
    [
      tx({ occurredOn: day(2026, 7, 5), amountCents: -10000n }),
      tx({ occurredOn: day(2026, 6, 5), amountCents: -99999n }),
    ],
    coberturaDeJulho,
  );
  assert.deepEqual(meses.map((m) => m.month), ['2026-07']);
});

test('mês coberto sem lançamento entra com zero, porque aí o zero é fato', () => {
  const meses = monthlyCashFlow([], coberturaDeJulho);
  assert.equal(meses.length, 1);
  assert.equal(meses[0].incomeCents, 0n);
  assert.equal(meses[0].expenseCents, 0n);
  assert.equal(meses[0].coverage, 'full');
});

test('cobertura parcial é declarada, não promovida a completa', () => {
  // Meio mês de extrato parece mês de gasto baixo, e ninguém percebe sozinho.
  const meses = monthlyCashFlow(
    [tx({ occurredOn: day(2026, 7, 10), amountCents: -10000n })],
    [{ start: day(2026, 7, 1), end: day(2026, 7, 15) }],
  );
  assert.equal(meses[0].coverage, 'partial');
});

test('vários lotes emendados cobrem o mês inteiro', () => {
  const meses = monthlyCashFlow(
    [tx({ occurredOn: day(2026, 7, 10), amountCents: -10000n })],
    [
      { start: day(2026, 7, 1), end: day(2026, 7, 15) },
      { start: day(2026, 7, 16), end: new Date(2026, 6, 31, 23, 59, 59, 999) },
    ],
  );
  assert.equal(meses[0].coverage, 'full');
});

test('transferência própria e lançamento pendente ficam fora do fluxo', () => {
  const meses = monthlyCashFlow(
    [
      tx({ occurredOn: day(2026, 7, 5), amountCents: -50000n, categoryKind: 'transfer' }),
      tx({ occurredOn: day(2026, 7, 6), amountCents: -30000n, status: 'pending' }),
      tx({ occurredOn: day(2026, 7, 7), amountCents: -10000n }),
    ],
    coberturaDeJulho,
  );
  assert.equal(meses[0].expenseCents, 10000n, 'só o lançamento liquidado e não-transferência');
});

test('os meses voltam em ordem cronológica', () => {
  const meses = monthlyCashFlow(
    [
      tx({ occurredOn: day(2026, 8, 5), amountCents: -1000n }),
      tx({ occurredOn: day(2026, 7, 5), amountCents: -1000n }),
    ],
    [{ start: day(2026, 7, 1), end: new Date(2026, 7, 31, 23, 59, 59, 999) }],
  );
  assert.deepEqual(meses.map((m) => m.month), ['2026-07', '2026-08']);
});

test('sem cobertura nenhuma, nenhum mês é afirmado', () => {
  const meses = monthlyCashFlow([tx({ amountCents: -1000n })], []);
  assert.deepEqual(meses, []);
});
