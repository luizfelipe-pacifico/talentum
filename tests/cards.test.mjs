import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardItemsFromEntries,
  clampedDay,
  daysUntil,
  feeWaiverProgress,
  itemsTotalCents,
  nextStatementCycle,
  outstandingCents,
  paymentCandidates,
  readInstallment,
  spendOfItems,
  statementStatusAfterPayments,
} from '../src/server/cards.ts';
import { cardStatementObligations, committedSummary, cashProjection } from '../src/server/dashboard-metrics.ts';

/* Regras de cartão, fatura e benefício (Stage 8). Dados sintéticos. */

const d = (year, month, day) => new Date(year, month - 1, day);

test('dia do mês é limitado ao último dia em meses curtos', () => {
  assert.equal(clampedDay(2026, 1, 31).getDate(), 28);
  assert.equal(clampedDay(2028, 1, 31).getDate(), 29, 'ano bissexto');
  assert.equal(clampedDay(2026, 3, 31).getDate(), 30);
});

test('próximo ciclo: fechamento igual ou depois da referência, vencimento depois do fechamento', () => {
  const cycle = nextStatementCycle({ closingDay: 3, dueDay: 10 }, d(2026, 9, 20));
  assert.deepEqual([cycle.closingDate.getMonth(), cycle.closingDate.getDate()], [9, 3]);
  assert.deepEqual([cycle.dueDate.getMonth(), cycle.dueDate.getDate()], [9, 10]);
  assert.deepEqual([cycle.periodStart.getMonth(), cycle.periodStart.getDate()], [8, 4]);
  assert.equal(cycle.closingIsEstimated, false);

  // Vencimento antes do dia de fechamento: cai no mês seguinte ao fechamento.
  const crossing = nextStatementCycle({ closingDay: 25, dueDay: 5 }, d(2026, 12, 26));
  assert.equal(crossing.closingDate.getFullYear(), 2027);
  assert.deepEqual([crossing.dueDate.getMonth(), crossing.dueDate.getDate()], [1, 5]);

  // No próprio dia do fechamento, a fatura que fecha hoje ainda é a próxima.
  assert.equal(nextStatementCycle({ closingDay: 20, dueDay: 28 }, d(2026, 9, 20)).closingDate.getDate(), 20);
});

test('sem dia de fechamento, o ciclo é aproximado e declarado como tal', () => {
  const cycle = nextStatementCycle({ closingDay: null, dueDay: 10 }, d(2026, 9, 20));
  assert.equal(cycle.closingIsEstimated, true);
  assert.deepEqual([cycle.dueDate.getMonth(), cycle.dueDate.getDate()], [9, 10]);
  assert.deepEqual([cycle.closingDate.getMonth(), cycle.closingDate.getDate()], [9, 3]);
});

test('em aberto nunca é negativo e a situação segue os pagamentos', () => {
  assert.equal(outstandingCents(100_00n, 30_00n), 70_00n);
  assert.equal(outstandingCents(100_00n, 120_00n), 0n);
  assert.equal(statementStatusAfterPayments('open', 100_00n, 100_00n), 'paid');
  assert.equal(statementStatusAfterPayments('paid', 100_00n, 40_00n), 'open', 'desfazer pagamento reabre');
  assert.equal(statementStatusAfterPayments('cancelled', 100_00n, 100_00n), 'cancelled');
  assert.equal(statementStatusAfterPayments('open', 0n, 0n), 'open', 'fatura zerada não se quita sozinha');
});

test('total e gasto dos itens: estorno abate o total, mas não é gasto', () => {
  const items = [{ amountCents: 200_00n }, { amountCents: 50_00n }, { amountCents: -30_00n }];
  assert.equal(itemsTotalCents(items), 220_00n);
  assert.equal(spendOfItems(items), 250_00n);
});

test('termômetro por fatura usa a fatura aberta mais próxima do vencimento', () => {
  const rule = { thresholdCents: 1_000_00n, period: 'statement' };
  const statements = [
    { dueDate: d(2026, 8, 10), status: 'paid', spendCents: 2_000_00n },
    { dueDate: d(2026, 10, 10), status: 'open', spendCents: 300_00n },
    { dueDate: d(2026, 9, 10), status: 'open', spendCents: 400_00n },
  ];
  const progress = feeWaiverProgress(rule, statements, d(2026, 9, 1));
  assert.equal(progress.spentCents, 400_00n);
  assert.equal(progress.remainingCents, 600_00n);
  assert.equal(progress.percent, 40);
  assert.equal(progress.met, false);
  assert.equal(progress.basisDueDate.getMonth(), 8);
});

test('termômetro anual soma as faturas que vencem no ano e para em 100%', () => {
  const rule = { thresholdCents: 500_00n, period: 'year' };
  const statements = [
    { dueDate: d(2025, 12, 10), status: 'paid', spendCents: 9_000_00n },
    { dueDate: d(2026, 1, 10), status: 'paid', spendCents: 300_00n },
    { dueDate: d(2026, 2, 10), status: 'open', spendCents: 400_00n },
    { dueDate: d(2026, 3, 10), status: 'cancelled', spendCents: 999_00n },
  ];
  const progress = feeWaiverProgress(rule, statements, d(2026, 6, 1));
  assert.equal(progress.spentCents, 700_00n);
  assert.equal(progress.remainingCents, 0n);
  assert.equal(progress.percent, 100);
  assert.equal(progress.met, true);
});

test('sem regra de isenção não existe termômetro', () => {
  assert.equal(feeWaiverProgress(null, [], d(2026, 1, 1)), null);
  assert.equal(feeWaiverProgress({ thresholdCents: 0n, period: 'year' }, [], d(2026, 1, 1)), null);
});

test('candidatos a pagamento: saída na janela, exato antes de parcial, nunca maior que o aberto', () => {
  const statement = { dueDate: d(2026, 9, 10), outstandingCents: 500_00n, paymentAccountId: null };
  const tx = (id, day, cents, accountId = 'a1') => ({ id, accountId, occurredOn: d(2026, 9, day), amountCents: cents });
  const result = paymentCandidates(
    statement,
    [
      tx('parcial-perto', 10, -200_00n),
      tx('exato-longe', 1, -500_00n),
      tx('entrada', 10, 500_00n),
      tx('maior', 10, -600_00n),
      tx('ligado', 10, -500_00n),
      { id: 'fora-da-janela', accountId: 'a1', occurredOn: d(2026, 8, 1), amountCents: -500_00n },
    ],
    new Set(['ligado']),
  );
  assert.deepEqual(
    result.map((candidate) => [candidate.id, candidate.match]),
    [
      ['exato-longe', 'exact'],
      ['parcial-perto', 'partial'],
    ],
  );
  assert.equal(result[0].daysFromDue, -9);
});

test('com conta de pagamento, só os lançamentos dela são candidatos', () => {
  const statement = { dueDate: d(2026, 9, 10), outstandingCents: 100_00n, paymentAccountId: 'a2' };
  const rows = [
    { id: 'x', accountId: 'a1', occurredOn: d(2026, 9, 10), amountCents: -100_00n },
    { id: 'y', accountId: 'a2', occurredOn: d(2026, 9, 10), amountCents: -100_00n },
  ];
  assert.deepEqual(paymentCandidates(statement, rows, new Set()).map((row) => row.id), ['y']);
  assert.deepEqual(paymentCandidates({ ...statement, outstandingCents: 0n }, rows, new Set()), []);
});

test('itens importados: sinal da fatura, parcela e chave estável por ocorrência', () => {
  const entries = [
    { occurredOn: d(2026, 9, 2), description: 'LOJA SINTETICA PARC 02/10', amountCents: -100_00n },
    { occurredOn: d(2026, 9, 2), description: 'CAFE', amountCents: -5_00n },
    { occurredOn: d(2026, 9, 2), description: 'CAFE', amountCents: -5_00n },
    { occurredOn: d(2026, 9, 3), description: 'ESTORNO', amountCents: 20_00n },
  ];
  const items = cardItemsFromEntries(entries);
  assert.deepEqual(
    items.map((item) => item.amountCents),
    [100_00n, 5_00n, 5_00n, -20_00n],
  );
  assert.equal(items[0].installmentNumber, 2);
  assert.equal(items[0].installmentCount, 10);
  assert.notEqual(items[1].externalId, items[2].externalId, 'duas compras iguais continuam sendo duas');
  assert.deepEqual(
    cardItemsFromEntries(entries).map((item) => item.externalId),
    items.map((item) => item.externalId),
    'o mesmo arquivo produz as mesmas chaves',
  );
});

test('leitura de parcela não confunde data nem aceita parcela impossível', () => {
  assert.deepEqual(readInstallment('ASSINATURA 3 de 12'), { number: 3, count: 12 });
  assert.equal(readInstallment('COMPRA 12/03'), null);
  assert.equal(readInstallment('COMPRA'), null);
});

test('dias até a expiração', () => {
  assert.equal(daysUntil(d(2026, 9, 30), d(2026, 9, 1)), 29);
  assert.equal(daysUntil(null, d(2026, 9, 1)), null);
  assert.equal(daysUntil(d(2026, 8, 30), d(2026, 9, 1)), -2);
});

/* ── Saldo Livre de Risco: faturas como segundo termo (docs/PRODUCT.md, V) ── */

const statement = (over = {}) => ({
  dueDate: d(2026, 9, 15),
  totalCents: 1_000_00n,
  paidCents: 0n,
  status: 'open',
  isEstimated: false,
  ...over,
});

test('fatura aberta pesa pelo que falta pagar; paga, cancelada ou quitada não pesa', () => {
  const obligations = cardStatementObligations([
    statement(),
    statement({ paidCents: 400_00n }),
    statement({ status: 'paid', paidCents: 1_000_00n }),
    statement({ status: 'cancelled' }),
    statement({ paidCents: 1_200_00n }),
  ]);
  assert.deepEqual(
    obligations.map((obligation) => obligation.amountCents),
    [1_000_00n, 600_00n],
  );
});

test('faturas somam ao comprometido do período junto das obrigações, sem contar as de depois', () => {
  const periodEnd = d(2026, 9, 30);
  const scheduled = [{ amountCents: 200_00n, dueDate: d(2026, 9, 20), status: 'open' }];
  const cards = cardStatementObligations([
    statement({ isEstimated: true }),
    statement({ dueDate: d(2026, 10, 10) }),
  ]);
  const summary = committedSummary([...scheduled, ...cards], periodEnd);
  assert.equal(summary.cents, 1_200_00n);
  assert.equal(summary.count, 2);
  assert.equal(summary.estimatedCount, 1, 'fatura estimada é sinalizada no veredito');
});

test('fatura vencida e não paga continua pesando no primeiro dia da projeção', () => {
  const projection = cashProjection(
    5_000_00n,
    cardStatementObligations([statement({ dueDate: d(2026, 9, 1) })]),
    d(2026, 9, 10),
    d(2026, 9, 12),
  );
  assert.equal(projection.points[0].dueCents, 1_000_00n);
  assert.equal(projection.endingBalanceCents, 4_000_00n);
});
