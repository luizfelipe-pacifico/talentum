import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetSummary,
  budgetStatus,
  isMonthFullyCovered,
  measuredMonthlySurplus,
  monthBounds,
  monthPhase,
  observedThrough,
  projectToMonthEnd,
  shiftMonth,
  spendingByCategory,
  threeMonthAverage,
} from '../src/server/budget-metrics.ts';
import { allocateSurplus, goalPlan, monthsUntil, progressBps, savedCents } from '../src/server/goal-metrics.ts';
import {
  annualEquivalentBps,
  essentialSplit,
  monthlyInterestCents,
  orderDebts,
  payoffPlan,
  survivalStatus,
} from '../src/server/debt-metrics.ts';
import { netWorthSummary, pillarStatus, shareBps, simulateContribution } from '../src/server/arca-metrics.ts';
import { centsToInput, formatBps, parseMoneyInput, parsePercentToBps } from '../src/lib/money-input.ts';

/* Fórmulas de orçamento, metas, dívidas e patrimônio (Stages 9, 12, 13 e 14).
   Todos os valores são sintéticos. */

const day = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);
const tx = (over = {}) => ({
  accountId: 'a1',
  occurredOn: day(2026, 11, 5),
  amountCents: -1000n,
  status: 'posted',
  categoryId: 'food',
  categoryKind: 'expense',
  ...over,
});
const cover = (start, end) => ({ start: new Date(`${start}T00:00:00`), end: new Date(`${end}T23:59:59.999`) });

/* ── Orçamento ─────────────────────────────────────────────────── */

test('mês civil: limites, deslocamento e fase', () => {
  assert.equal(monthBounds('2026-02').days, 28);
  assert.equal(monthBounds('2028-02').days, 29);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthPhase('2026-11', day(2026, 11, 20)), 'current');
  assert.equal(monthPhase('2026-10', day(2026, 11, 20)), 'past');
  assert.equal(monthPhase('2027-01', day(2026, 11, 20)), 'future');
  assert.throws(() => monthBounds('2026-13'), RangeError);
});

test('gasto por categoria ignora pendente, transferência, receita e outro mês', () => {
  const spending = spendingByCategory(
    [
      tx({ amountCents: -1500n }),
      tx({ amountCents: -700n, status: 'pending' }),
      tx({ amountCents: -900n, categoryKind: 'transfer' }),
      tx({ amountCents: 5000n, categoryKind: 'income', categoryId: 'salary' }),
      tx({ amountCents: -300n, occurredOn: day(2026, 10, 31) }),
      tx({ amountCents: -200n, categoryId: null, categoryKind: null }),
    ],
    '2026-11',
  );
  assert.equal(spending.get('food'), 1500n);
  assert.equal(spending.get(null), 200n);
  assert.equal(spending.has('salary'), false);
});

test('projeção estende o ritmo observado e não existe sem dia observado', () => {
  assert.equal(projectToMonthEnd(10_00n, 10, 30), 30_00n);
  assert.equal(projectToMonthEnd(1n, 3, 30), 10n); // 10/3 = 3,33 -> arredonda o total, não o ritmo
  assert.equal(projectToMonthEnd(0n, 5, 30), 0n);
  assert.equal(projectToMonthEnd(50n, 30, 30), 50n);
  assert.equal(projectToMonthEnd(50n, null, 30), null);
  assert.equal(projectToMonthEnd(50n, 0, 30), null);
});

test('dias observados param no fim do extrato e no dia de hoje', () => {
  const today = day(2026, 11, 20);
  assert.equal(observedThrough('2026-11', [cover('2026-11-01', '2026-11-10')], today), 10);
  assert.equal(observedThrough('2026-11', [cover('2026-10-01', '2026-12-31')], today), 20);
  assert.equal(observedThrough('2026-10', [cover('2026-10-01', '2026-10-31')], today), 31);
  assert.equal(observedThrough('2026-11', [], today), null);
  assert.equal(observedThrough('2026-12', [cover('2026-12-01', '2026-12-31')], today), null);
});

test('cobertura completa exige o mês inteiro', () => {
  assert.equal(isMonthFullyCovered('2026-10', [cover('2026-10-01', '2026-10-31')]), true);
  assert.equal(isMonthFullyCovered('2026-10', [cover('2026-10-01', '2026-10-15'), cover('2026-10-10', '2026-10-31')]), true);
  assert.equal(isMonthFullyCovered('2026-10', [cover('2026-10-02', '2026-10-31')]), false);
  assert.equal(isMonthFullyCovered('2026-10', []), false);
});

test('média de três meses ignora mês sem extrato em vez de contar zero', () => {
  const transactions = [
    tx({ occurredOn: day(2026, 10, 3), amountCents: -300_00n }),
    tx({ occurredOn: day(2026, 8, 3), amountCents: -101_00n }),
    tx({ occurredOn: day(2026, 9, 3), amountCents: -999_00n }), // setembro sem extrato: fora
  ];
  const coverage = [cover('2026-10-01', '2026-10-31'), cover('2026-08-01', '2026-08-31')];
  const result = threeMonthAverage(transactions, coverage, '2026-11');
  assert.equal(result.monthsUsed, 2);
  assert.equal(result.averages.get('food'), 200_50n);
  assert.equal(result.totalCents, 200_50n);
  const none = threeMonthAverage(transactions, [], '2026-11');
  assert.equal(none.monthsUsed, 0);
  assert.equal(none.totalCents, null);
});

test('situação da linha: acima, em risco, dentro e sem limite', () => {
  assert.equal(budgetStatus(null, 10n, 20n), 'no_limit');
  assert.equal(budgetStatus(100n, 101n, 200n), 'over');
  assert.equal(budgetStatus(100n, 50n, 101n), 'at_risk');
  assert.equal(budgetStatus(100n, 100n, 100n), 'within');
  assert.equal(budgetStatus(0n, 0n, 0n), 'within');
  assert.equal(budgetStatus(0n, 1n, null), 'over');
});

test('orçamento do mês: planejado, realizado, projeção, sobra e gasto sem categoria', () => {
  const summary = budgetSummary({
    month: '2026-11',
    today: day(2026, 11, 15),
    categories: [
      { id: 'food', name: 'Mercado' },
      { id: 'fun', name: 'Lazer' },
      { id: 'rent', name: 'Aluguel' },
    ],
    limits: new Map([
      ['food', 600_00n],
      ['fun', 100_00n],
    ]),
    transactions: [
      tx({ amountCents: -400_00n }),
      tx({ amountCents: -120_00n, categoryId: 'fun' }),
      tx({ amountCents: -50_00n, categoryId: null, categoryKind: null }),
      tx({ amountCents: 3000_00n, categoryId: 'salary', categoryKind: 'income' }),
      tx({ amountCents: -10_00n, categoryId: 'salary', categoryKind: 'income' }), // estorno em categoria de receita
    ],
    coverage: [cover('2026-11-01', '2026-11-15')],
  });
  const byId = Object.fromEntries(summary.lines.map((line) => [line.categoryId ?? 'none', line]));
  assert.equal(summary.observedDays, 15);
  assert.equal(byId.food.status, 'at_risk'); // 400 em 15 dias -> 800 no mês
  assert.equal(byId.food.projectedCents, 800_00n);
  assert.equal(byId.food.remainingCents, 200_00n);
  assert.equal(byId.fun.status, 'over');
  assert.equal(byId.rent.status, 'no_limit');
  assert.equal(byId.rent.actualCents, 0n);
  assert.equal(byId.none.actualCents, 60_00n, 'gasto em categoria que não é de despesa não some');
  assert.equal(summary.totals.limitCents, 700_00n);
  assert.equal(summary.totals.actualWithinLimitsCents, 520_00n);
  assert.equal(summary.totals.actualCents, 580_00n);
  assert.equal(summary.incomeCents, 3000_00n);
  assert.equal(summary.expenseCents, 580_00n);
  assert.equal(summary.surplusCents, 2420_00n);
  assert.equal(summary.averageMonthsUsed, 0);
  assert.equal(byId.food.averageCents, null);
  // Linhas com limite vêm antes, ordenadas pelo realizado.
  assert.deepEqual(summary.lines.map((line) => line.name), ['Mercado', 'Lazer', 'Sem categoria', 'Aluguel']);
});

test('orçamento sem nenhum dado não inventa projeção', () => {
  const summary = budgetSummary({ month: '2026-11', today: day(2026, 11, 15), categories: [], limits: new Map(), transactions: [], coverage: [] });
  assert.deepEqual(summary.lines, []);
  assert.equal(summary.totals.projectedCents, null);
  assert.equal(summary.surplusCents, 0n);
  const future = budgetSummary({ month: '2027-01', today: day(2026, 11, 15), categories: [{ id: 'food', name: 'Mercado' }], limits: new Map([['food', 1n]]), transactions: [], coverage: [] });
  assert.equal(future.lines[0].projectedCents, null);
});

test('sobra medida usa só meses completos e devolve null sem medição', () => {
  const transactions = [
    tx({ occurredOn: day(2026, 10, 2), amountCents: 1000_00n, categoryKind: 'income', categoryId: 'salary' }),
    tx({ occurredOn: day(2026, 10, 9), amountCents: -700_00n }),
    tx({ occurredOn: day(2026, 9, 2), amountCents: 1000_00n, categoryKind: 'income', categoryId: 'salary' }),
    tx({ occurredOn: day(2026, 9, 9), amountCents: -1200_00n }),
  ];
  const coverage = [cover('2026-09-01', '2026-10-31')];
  assert.deepEqual(measuredMonthlySurplus(transactions, coverage, day(2026, 11, 20)), { averageCents: 50_00n, monthsUsed: 2 });
  assert.deepEqual(measuredMonthlySurplus(transactions, [], day(2026, 11, 20)), { averageCents: null, monthsUsed: 0 });
  // O mês corrente nunca entra: ainda não terminou.
  assert.equal(measuredMonthlySurplus(transactions, [cover('2026-11-01', '2026-11-30')], day(2026, 11, 20)).monthsUsed, 0);
});

/* ── Metas ─────────────────────────────────────────────────────── */

test('valor guardado soma depósitos e desconta retiradas', () => {
  assert.equal(savedCents([]), 0n);
  assert.equal(savedCents([{ kind: 'deposit', amountCents: 500n }, { kind: 'withdrawal', amountCents: 200n }]), 300n);
});

test('progresso fica entre 0% e 100%', () => {
  assert.equal(progressBps(0n, 100n), 0);
  assert.equal(progressBps(1n, 3n), 3333);
  assert.equal(progressBps(150n, 100n), 10_000);
  assert.equal(progressBps(50n, 0n), 0);
  assert.equal(progressBps(-5n, 100n), 0);
});

test('meses até o prazo contam o mês corrente; prazo vencido é zero', () => {
  const today = day(2026, 11, 20);
  assert.equal(monthsUntil(today, day(2026, 11, 30)), 1);
  assert.equal(monthsUntil(today, day(2026, 11, 20)), 1);
  assert.equal(monthsUntil(today, day(2027, 4, 1)), 6);
  assert.equal(monthsUntil(today, day(2026, 11, 19)), 0);
  assert.equal(monthsUntil(today, null), null);
});

test('plano da meta: depósito mensal arredondado para cima e viabilidade contra a sobra medida', () => {
  const today = day(2026, 11, 20);
  const base = { targetCents: 1000_00n, deadline: day(2027, 1, 31), contributions: [{ kind: 'deposit', amountCents: 1n }], today };
  const plan = goalPlan({ ...base, measuredSurplusCents: 400_00n });
  assert.equal(plan.monthsLeft, 3);
  assert.equal(plan.remainingCents, 999_99n);
  assert.equal(plan.requiredMonthlyCents, 333_33n); // 999,99 / 3 = 333,33
  assert.equal(plan.feasibility, 'feasible');
  assert.equal(goalPlan({ ...base, contributions: [], measuredSurplusCents: 400_00n }).requiredMonthlyCents, 333_34n);
  assert.equal(goalPlan({ ...base, measuredSurplusCents: 300_00n }).feasibility, 'not_feasible');
  assert.equal(goalPlan({ ...base, measuredSurplusCents: -10n }).feasibility, 'not_feasible');
  assert.equal(goalPlan({ ...base, measuredSurplusCents: null }).feasibility, 'no_data');
  assert.equal(goalPlan({ ...base, deadline: null, measuredSurplusCents: 1n }).feasibility, 'no_deadline');
  const late = goalPlan({ ...base, deadline: day(2026, 10, 1), measuredSurplusCents: 1n });
  assert.equal(late.feasibility, 'deadline_passed');
  assert.equal(late.requiredMonthlyCents, null);
  const done = goalPlan({ ...base, contributions: [{ kind: 'deposit', amountCents: 2000_00n }], measuredSurplusCents: null });
  assert.equal(done.feasibility, 'achieved');
  assert.equal(done.remainingCents, 0n);
  assert.equal(done.progressBps, 10_000);
});

test('distribuição proporcional soma exatamente o valor e respeita o que falta', () => {
  const goals = [
    { id: 'a', remainingCents: 100n, requiredMonthlyCents: 10n },
    { id: 'b', remainingCents: 200n, requiredMonthlyCents: 100n },
  ];
  const result = allocateSurplus(100n, goals, 'proportional');
  assert.deepEqual(result.allocations, [{ goalId: 'a', cents: 33n }, { goalId: 'b', cents: 67n }]);
  assert.equal(result.unallocatedCents, 0n);
  const odd = allocateSurplus(1n, [{ id: 'a', remainingCents: 5n, requiredMonthlyCents: null }, { id: 'b', remainingCents: 5n, requiredMonthlyCents: null }], 'proportional');
  assert.equal(odd.allocations.reduce((sum, item) => sum + item.cents, 0n), 1n);
  const capped = allocateSurplus(1000n, goals, 'proportional');
  assert.deepEqual(capped.allocations.map((item) => item.cents), [100n, 200n]);
  assert.equal(capped.unallocatedCents, 700n);
});

test('distribuição pelo prazo pesa o depósito mensal necessário e redistribui o excedente', () => {
  const goals = [
    { id: 'near', remainingCents: 50n, requiredMonthlyCents: 50n },
    { id: 'far', remainingCents: 1000n, requiredMonthlyCents: 50n },
    { id: 'open', remainingCents: 500n, requiredMonthlyCents: null },
  ];
  const result = allocateSurplus(200n, goals, 'deadline');
  const byId = Object.fromEntries(result.allocations.map((item) => [item.goalId, item.cents]));
  assert.equal(byId.near, 50n, 'a meta próxima recebe só o que falta');
  assert.equal(byId.far, 150n, 'o excedente vai para a outra meta com prazo');
  assert.equal(byId.open, 0n);
  assert.equal(result.unallocatedCents, 0n);
  const spill = allocateSurplus(2000n, goals, 'deadline');
  assert.deepEqual(spill.allocations.map((item) => item.cents), [50n, 1000n, 500n]);
  assert.equal(spill.unallocatedCents, 450n);
  assert.deepEqual(allocateSurplus(0n, goals, 'deadline').allocations.map((item) => item.cents), [0n, 0n, 0n]);
  assert.equal(allocateSurplus(-5n, goals, 'proportional').unallocatedCents, 0n);
  assert.deepEqual(allocateSurplus(10n, [], 'proportional'), { allocations: [], unallocatedCents: 10n });
});

/* ── Dívidas ───────────────────────────────────────────────────── */

const debt = (over) => ({ id: over.id, name: over.id, principalCents: 0n, monthlyRateBps: 0, minimumPaymentCents: 0n, overdueCents: 0n, ...over });

test('avalanche ordena pela taxa e bola de neve pelo saldo, com desempate estável', () => {
  const debts = [
    debt({ id: 'card', principalCents: 3000n, monthlyRateBps: 1200 }),
    debt({ id: 'loan', principalCents: 1000n, monthlyRateBps: 200 }),
    debt({ id: 'store', principalCents: 1000n, monthlyRateBps: 500 }),
  ];
  assert.deepEqual(orderDebts(debts, 'avalanche').map((item) => item.id), ['card', 'store', 'loan']);
  assert.deepEqual(orderDebts(debts, 'snowball').map((item) => item.id), ['store', 'loan', 'card']);
});

test('juros mensais arredondam no centavo e taxa anual equivalente compõe', () => {
  assert.equal(monthlyInterestCents(10_000n, 1250), 1250n);
  assert.equal(monthlyInterestCents(333n, 150), 5n); // 4,995 -> 5
  assert.equal(monthlyInterestCents(0n, 1000), 0n);
  assert.equal(monthlyInterestCents(100n, 0), 0n);
  assert.equal(annualEquivalentBps(100), 1268); // 1% ao mês ≈ 12,68% ao ano
  assert.equal(annualEquivalentBps(0), 0);
});

test('plano de quitação: sem juros, quita em meses exatos e soma o que foi pago', () => {
  const plan = payoffPlan([debt({ id: 'a', principalCents: 300n, minimumPaymentCents: 100n })], 100n, 'avalanche');
  assert.equal(plan.status, 'ok');
  assert.equal(plan.monthsToPayoff, 3);
  assert.equal(plan.totalInterestCents, 0n);
  assert.equal(plan.totalPaidCents, 300n);
  assert.deepEqual(plan.months.map((month) => month.totalBalanceCents), [200n, 100n, 0n]);
});

test('plano de quitação: o extra vai para a primeira da ordem e a parcela liberada reforça a próxima', () => {
  const debts = [
    debt({ id: 'cara', principalCents: 1000_00n, monthlyRateBps: 1000, minimumPaymentCents: 100_00n }),
    debt({ id: 'barata', principalCents: 500_00n, monthlyRateBps: 100, minimumPaymentCents: 50_00n }),
  ];
  const avalanche = payoffPlan(debts, 400_00n, 'avalanche');
  const snowball = payoffPlan(debts, 400_00n, 'snowball');
  assert.equal(avalanche.status, 'ok');
  assert.equal(snowball.status, 'ok');
  assert.equal(avalanche.months[0].payments.find((item) => item.debtId === 'cara').paidCents, 350_00n);
  assert.equal(snowball.months[0].payments.find((item) => item.debtId === 'barata').paidCents, 300_00n);
  assert.ok(avalanche.totalInterestCents < snowball.totalInterestCents, 'avalanche custa menos juros');
  assert.ok(snowball.payoffMonth.barata < avalanche.payoffMonth.barata, 'bola de neve quita a menor antes');
  for (const plan of [avalanche, snowball]) {
    const principal = 1500_00n;
    assert.equal(plan.totalPaidCents, principal + plan.totalInterestCents, 'pago = principal + juros, ao centavo');
    for (const month of plan.months) assert.ok(month.totalPaidCents <= 400_00n, 'nunca paga mais que o orçamento');
  }
});

test('plano de quitação recusa orçamento abaixo das mínimas e para no horizonte', () => {
  const debts = [debt({ id: 'a', principalCents: 1000n, monthlyRateBps: 1000, minimumPaymentCents: 100n })];
  assert.deepEqual(payoffPlan(debts, 99n, 'avalanche'), { status: 'insufficient', minimumTotalCents: 100n });
  assert.deepEqual(payoffPlan([], 100n, 'avalanche'), { status: 'no_debts' });
  assert.deepEqual(payoffPlan([debt({ id: 'z', principalCents: 0n })], 100n, 'snowball'), { status: 'no_debts' });
  // Juros de 10% sobre 1.000 = 100: a parcela de 100 só paga juros, o saldo nunca cai.
  assert.deepEqual(payoffPlan(debts, 100n, 'avalanche', 24), { status: 'too_long', horizonMonths: 24 });
  assert.equal(payoffPlan([debt({ id: 'b', principalCents: 100n })], 0n, 'avalanche').status, 'insufficient');
});

test('modo sobrevivência: saldo negativo conhecido ou dívida em atraso; desconhecido não ativa', () => {
  assert.deepEqual(survivalStatus({ riskFreeBalanceCents: -1n, debts: [] }), { active: true, reasons: ['negative_risk_free_balance'] });
  assert.deepEqual(survivalStatus({ riskFreeBalanceCents: 10n, debts: [{ overdueCents: 1n }] }), { active: true, reasons: ['overdue_debt'] });
  assert.deepEqual(survivalStatus({ riskFreeBalanceCents: null, debts: [] }), { active: false, reasons: [] });
  assert.deepEqual(survivalStatus({ riskFreeBalanceCents: 0n, debts: [{ overdueCents: 0n }] }), { active: false, reasons: [] });
});

test('gasto essencial, não essencial e sem categoria ficam separados', () => {
  const split = essentialSplit(new Map([['rent', 1000n], ['fun', 300n], [null, 50n]]), new Set(['rent']));
  assert.deepEqual(split, { essentialCents: 1000n, nonEssentialCents: 300n, uncategorizedCents: 50n });
  assert.deepEqual(essentialSplit(new Map(), new Set()), { essentialCents: 0n, nonEssentialCents: 0n, uncategorizedCents: 0n });
});

/* ── Patrimônio e quatro pilares ───────────────────────────────── */

test('participação e situação na banda de 22,5% a 27,5%, com limites dentro', () => {
  assert.equal(shareBps(1n, 3n), 3333);
  assert.equal(shareBps(2n, 3n), 6667);
  assert.equal(shareBps(5n, 0n), 0);
  assert.equal(pillarStatus(2250), 'balanced');
  assert.equal(pillarStatus(2750), 'balanced');
  assert.equal(pillarStatus(2249), 'lagging');
  assert.equal(pillarStatus(2751), 'overweight');
});

test('patrimônio soma pilares e bens fora deles, e informa a data-base mais antiga', () => {
  const older = day(2026, 9, 1);
  const summary = netWorthSummary([
    { pillar: 'stocks', valueCents: 13_000_00n, capturedAt: day(2026, 11, 1) },
    { pillar: 'real_estate', valueCents: 9_000_00n, capturedAt: older },
    { pillar: 'cash', valueCents: 11_000_00n, capturedAt: day(2026, 11, 1) },
    { pillar: 'international', valueCents: 7_000_00n, capturedAt: day(2026, 11, 1) },
    { pillar: 'outside', valueCents: 5_000_00n, capturedAt: day(2026, 11, 1) },
    { pillar: 'cash', valueCents: null, capturedAt: null },
  ]);
  assert.equal(summary.netWorthCents, 45_000_00n);
  assert.equal(summary.pillarTotalCents, 40_000_00n);
  assert.equal(summary.outsideCents, 5_000_00n);
  assert.equal(summary.assetsWithoutValue, 1);
  assert.equal(summary.referenceDate.getTime(), older.getTime());
  // Exemplo da fonte (docs/ARCA-VISION.md, 5.4), já sob a banda.
  assert.deepEqual(summary.pillars.map((item) => [item.shareBps, item.status]), [
    [3250, 'overweight'],
    [2250, 'balanced'],
    [2750, 'balanced'],
    [1750, 'lagging'],
  ]);
  assert.equal(summary.balanced, false);
  const empty = netWorthSummary([]);
  assert.equal(empty.netWorthCents, 0n);
  assert.equal(empty.balanced, false);
  assert.equal(empty.referenceDate, null);
});

test('simulação de aporte vai primeiro ao pilar mais defasado e nunca tira de ninguém', () => {
  const pillars = [
    { pillar: 'stocks', cents: 13_000_00n },
    { pillar: 'real_estate', cents: 9_000_00n },
    { pillar: 'cash', cents: 11_000_00n },
    { pillar: 'international', cents: 7_000_00n },
  ];
  const steps = simulateContribution(pillars, 1_000_00n);
  assert.deepEqual(steps.map((step) => step.allocationCents), [0n, 0n, 0n, 1_000_00n]);
  assert.equal(steps[3].afterCents, 8_000_00n);

  const larger = simulateContribution(pillars, 5_000_00n);
  // 7.000 sobe até 9.000 (custa 2.000); os dois sobem juntos com os 3.000 restantes até 10.500.
  assert.deepEqual(larger.map((step) => step.allocationCents), [0n, 1_500_00n, 0n, 3_500_00n]);
  for (const step of larger) assert.ok(step.afterCents >= step.beforeCents, 'nenhuma venda');
  assert.equal(larger.reduce((sum, step) => sum + step.allocationCents, 0n), 5_000_00n);
});

test('simulação de aporte: carteira vazia divide igual e centavos fecham a soma', () => {
  const steps = simulateContribution([], 1_003n);
  assert.deepEqual(steps.map((step) => step.allocationCents), [251n, 251n, 251n, 250n]);
  assert.deepEqual(steps.map((step) => step.afterStatus), ['balanced', 'balanced', 'balanced', 'balanced']);
  assert.deepEqual(simulateContribution([{ pillar: 'cash', cents: 10n }], 0n).map((step) => step.allocationCents), [0n, 0n, 0n, 0n]);
  assert.throws(() => simulateContribution([], -1n), RangeError);
  // Pilar sobrecarregado não recebe nem com aporte grande.
  const frozen = simulateContribution([{ pillar: 'stocks', cents: 100_00n }], 30_00n);
  assert.equal(frozen[0].allocationCents, 0n);
});

/* ── Entrada de valores ────────────────────────────────────────── */

test('valor digitado vira centavos sem ponto flutuante', () => {
  assert.equal(parseMoneyInput('1.234,56'), '123456');
  assert.equal(parseMoneyInput('R$ 10,5'), '1050');
  assert.equal(parseMoneyInput('1234.56'), '123456');
  assert.equal(parseMoneyInput('1.234'), '123400');
  assert.equal(parseMoneyInput('0,29'), '29');
  assert.equal(parseMoneyInput('0'), null);
  assert.equal(parseMoneyInput('0', { allowZero: true }), '0');
  assert.equal(parseMoneyInput('-5'), null);
  assert.equal(parseMoneyInput('1,234'), null);
  assert.equal(parseMoneyInput('abc'), null);
  assert.equal(parseMoneyInput(''), null);
  assert.equal(parsePercentToBps('12,5'), 1250);
  assert.equal(parsePercentToBps('0'), 0);
  assert.equal(parsePercentToBps('1,234'), null);
  assert.equal(centsToInput('123456'), '1234,56');
  assert.equal(formatBps(1250), '12,5%');
});
