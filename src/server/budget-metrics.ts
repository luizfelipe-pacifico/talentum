/* Fórmulas do orçamento mensal (Stage 9 de docs/ROADMAP.md).

   Módulo puro, no mesmo molde de `dashboard-metrics.ts`: sem Prisma, sem rede,
   sem relógio implícito. Dinheiro em centavos inteiros (BigInt).

   Regras de honestidade herdadas do painel (docs/PRODUCT.md):
   - o realizado vem só de lançamento confirmado; pendente e transferência
     própria ficam de fora;
   - mês sem extrato não é mês sem gasto: a média móvel ignora o mês sem
     cobertura em vez de contá-lo como zero;
   - a projeção só existe quando há dias observados no mês. */

import { divideRoundHalfUp, type CoverageRange, type TransactionInput } from './dashboard-metrics.ts';

/** Mês civil `AAAA-MM`. */
export type MonthKey = string;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function monthKeyOf(date: Date): MonthKey {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

function parseMonth(month: MonthKey): { year: number; index: number } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new RangeError('Mês inválido.');
  return { year: Number(match[1]), index: Number(match[2]) - 1 };
}

/** Primeiro instante e último instante do mês civil local. */
export function monthBounds(month: MonthKey): { start: Date; end: Date; days: number } {
  const { year, index } = parseMonth(month);
  const start = new Date(year, index, 1, 0, 0, 0, 0);
  const end = new Date(year, index + 1, 0, 23, 59, 59, 999);
  return { start, end, days: end.getDate() };
}

/** Mês deslocado em `offset` meses (negativo para trás). */
export function shiftMonth(month: MonthKey, offset: number): MonthKey {
  const { year, index } = parseMonth(month);
  return monthKeyOf(new Date(year, index + offset, 1));
}

/** Posição do mês em relação ao mês de referência. */
export function monthPhase(month: MonthKey, today: Date): 'past' | 'current' | 'future' {
  const current = monthKeyOf(today);
  if (month === current) return 'current';
  return month < current ? 'past' : 'future';
}

const isCountedExpense = (transaction: TransactionInput) =>
  transaction.status !== 'pending' && transaction.categoryKind !== 'transfer' && transaction.amountCents < 0n;

const isCountedIncome = (transaction: TransactionInput) =>
  transaction.status !== 'pending' && transaction.categoryKind !== 'transfer' && transaction.amountCents > 0n;

/**
 * Gasto confirmado por categoria dentro do mês, como magnitude positiva.
 *
 * Lançamento sem categoria entra na chave `null`: some do orçamento seria
 * esconder dinheiro que saiu.
 */
export function spendingByCategory(transactions: TransactionInput[], month: MonthKey): Map<string | null, bigint> {
  const { start, end } = monthBounds(month);
  const totals = new Map<string | null, bigint>();
  for (const transaction of transactions) {
    if (!isCountedExpense(transaction)) continue;
    if (transaction.occurredOn < start || transaction.occurredOn > end) continue;
    const key = transaction.categoryId;
    totals.set(key, (totals.get(key) ?? 0n) - transaction.amountCents);
  }
  return totals;
}

/** Receita, gasto e sobra confirmados no mês. Transferência própria não entra. */
export function monthResult(transactions: TransactionInput[], month: MonthKey) {
  const { start, end } = monthBounds(month);
  let incomeCents = 0n;
  let expenseCents = 0n;
  for (const transaction of transactions) {
    if (transaction.occurredOn < start || transaction.occurredOn > end) continue;
    if (isCountedIncome(transaction)) incomeCents += transaction.amountCents;
    else if (isCountedExpense(transaction)) expenseCents -= transaction.amountCents;
  }
  return { incomeCents, expenseCents, surplusCents: incomeCents - expenseCents };
}

/**
 * Último dia do mês coberto por extrato, ou `null` sem cobertura.
 *
 * É o que diz até onde o realizado é conhecido. Sem isso, um extrato importado
 * até o dia 10 faria o resto do mês parecer sem gasto.
 */
export function observedThrough(month: MonthKey, coverage: CoverageRange[], today: Date): number | null {
  const { start, end, days } = monthBounds(month);
  let latest: Date | null = null;
  for (const range of coverage) {
    if (range.start > end || range.end < start) continue;
    const clipped = range.end > end ? end : range.end;
    if (!latest || clipped > latest) latest = clipped;
  }
  if (!latest) return null;
  const phase = monthPhase(month, today);
  if (phase === 'future') return null;
  const day = latest.getDate();
  if (phase === 'current') return Math.min(day, today.getDate());
  return Math.min(day, days);
}

/** O extrato cobre o mês do primeiro ao último dia. */
export function isMonthFullyCovered(month: MonthKey, coverage: CoverageRange[]): boolean {
  const { start, end } = monthBounds(month);
  const overlapping = coverage.filter((range) => range.start <= end && range.end >= start);
  if (overlapping.length === 0) return false;
  const earliest = overlapping.reduce((min, range) => (range.start < min ? range.start : min), overlapping[0].start);
  const latest = overlapping.reduce((max, range) => (range.end > max ? range.end : max), overlapping[0].end);
  return earliest <= start && latest >= end;
}

/**
 * Projeção linear até o fim do mês: o ritmo dos dias observados estendido aos
 * dias restantes. `null` sem dia observado.
 *
 * É uma extrapolação declarada, não uma previsão: a tela diz que é ritmo.
 */
export function projectToMonthEnd(actualCents: bigint, observedDays: number | null, daysInMonth: number): bigint | null {
  if (observedDays === null || observedDays < 1) return null;
  if (!Number.isInteger(daysInMonth) || daysInMonth < 1) throw new RangeError('Mês sem dias.');
  if (observedDays >= daysInMonth) return actualCents;
  return divideRoundHalfUp(actualCents * BigInt(daysInMonth), BigInt(observedDays));
}

/**
 * Média móvel de três meses por categoria.
 *
 * Usa os três meses civis anteriores ao mês de referência, mas só os que têm
 * extrato cobrindo o mês inteiro. O divisor é o número de meses válidos: um
 * mês sem extrato contado como zero puxaria a média para baixo sem motivo.
 */
export function threeMonthAverage(
  transactions: TransactionInput[],
  coverage: CoverageRange[],
  month: MonthKey,
): { averages: Map<string | null, bigint>; monthsUsed: number; totalCents: bigint | null } {
  const months = [1, 2, 3].map((offset) => shiftMonth(month, -offset)).filter((key) => isMonthFullyCovered(key, coverage));
  const sums = new Map<string | null, bigint>();
  let total = 0n;
  for (const key of months) {
    for (const [categoryId, cents] of spendingByCategory(transactions, key)) {
      sums.set(categoryId, (sums.get(categoryId) ?? 0n) + cents);
      total += cents;
    }
  }
  const averages = new Map<string | null, bigint>();
  if (months.length === 0) return { averages, monthsUsed: 0, totalCents: null };
  const divisor = BigInt(months.length);
  for (const [categoryId, cents] of sums) averages.set(categoryId, divideRoundHalfUp(cents, divisor));
  return { averages, monthsUsed: months.length, totalCents: divideRoundHalfUp(total, divisor) };
}

export type BudgetStatus = 'no_limit' | 'within' | 'at_risk' | 'over';

/**
 * Situação de uma linha do orçamento.
 *
 * `over` quando o realizado já passou do limite; `at_risk` quando só a
 * projeção passa. Um limite zero com gasto zero está dentro.
 */
export function budgetStatus(limitCents: bigint | null, actualCents: bigint, projectedCents: bigint | null): BudgetStatus {
  if (limitCents === null) return 'no_limit';
  if (actualCents > limitCents) return 'over';
  if (projectedCents !== null && projectedCents > limitCents) return 'at_risk';
  return 'within';
}

export type BudgetCategory = { id: string; name: string };

export type BudgetLine = {
  categoryId: string | null;
  name: string;
  limitCents: bigint | null;
  actualCents: bigint;
  projectedCents: bigint | null;
  averageCents: bigint | null;
  /** Limite menos realizado; negativo quando passou. `null` sem limite. */
  remainingCents: bigint | null;
  status: BudgetStatus;
};

export type BudgetSummary = {
  month: MonthKey;
  phase: 'past' | 'current' | 'future';
  daysInMonth: number;
  observedDays: number | null;
  fullyCovered: boolean;
  lines: BudgetLine[];
  totals: {
    limitCents: bigint;
    /** Realizado das categorias que têm limite: a comparação justa com o total planejado. */
    actualWithinLimitsCents: bigint;
    actualCents: bigint;
    projectedCents: bigint | null;
    averageCents: bigint | null;
  };
  averageMonthsUsed: number;
  incomeCents: bigint;
  expenseCents: bigint;
  surplusCents: bigint;
};

/**
 * Orçamento do mês: planejado contra realizado, por categoria de despesa.
 *
 * Toda categoria de despesa aparece, com ou sem limite, e também qualquer
 * categoria com gasto no mês. O gasto sem categoria vira uma linha própria.
 */
export function budgetSummary(input: {
  month: MonthKey;
  today: Date;
  categories: BudgetCategory[];
  limits: Map<string, bigint>;
  transactions: TransactionInput[];
  coverage: CoverageRange[];
}): BudgetSummary {
  const { month, today, categories, limits, transactions, coverage } = input;
  const { days } = monthBounds(month);
  const phase = monthPhase(month, today);
  const observedDays = observedThrough(month, coverage, today);
  const actual = spendingByCategory(transactions, month);
  const average = threeMonthAverage(transactions, coverage, month);

  const names = new Map(categories.map((category) => [category.id, category.name]));
  const keys: (string | null)[] = categories.map((category) => category.id);
  for (const key of actual.keys()) {
    if (key !== null && !names.has(key)) continue; // categoria de outro tipo: não é despesa planejável
    if (!keys.includes(key)) keys.push(key);
  }
  // Gasto em categoria que não é de despesa (por exemplo, receita usada errado)
  // também não pode sumir: soma no grupo sem categoria.
  let foreign = 0n;
  for (const [key, cents] of actual) if (key !== null && !names.has(key)) foreign += cents;
  if (foreign > 0n) {
    actual.set(null, (actual.get(null) ?? 0n) + foreign);
    if (!keys.includes(null)) keys.push(null);
  }

  const lines: BudgetLine[] = keys.map((categoryId) => {
    const actualCents = actual.get(categoryId) ?? 0n;
    const limitCents = categoryId === null ? null : (limits.get(categoryId) ?? null);
    const projectedCents = phase === 'future' ? null : projectToMonthEnd(actualCents, observedDays, days);
    const averageCents = average.monthsUsed === 0 ? null : (average.averages.get(categoryId) ?? 0n);
    return {
      categoryId,
      name: categoryId === null ? 'Sem categoria' : (names.get(categoryId) as string),
      limitCents,
      actualCents,
      projectedCents,
      averageCents,
      remainingCents: limitCents === null ? null : limitCents - actualCents,
      status: budgetStatus(limitCents, actualCents, projectedCents),
    };
  });

  lines.sort((left, right) => {
    if ((left.limitCents === null) !== (right.limitCents === null)) return left.limitCents === null ? 1 : -1;
    if (right.actualCents !== left.actualCents) return right.actualCents > left.actualCents ? 1 : -1;
    return left.name.localeCompare(right.name, 'pt-BR');
  });

  let limitTotal = 0n;
  let actualWithinLimits = 0n;
  let actualTotal = 0n;
  for (const line of lines) {
    actualTotal += line.actualCents;
    if (line.limitCents !== null) {
      limitTotal += line.limitCents;
      actualWithinLimits += line.actualCents;
    }
  }

  const result = monthResult(transactions, month);
  return {
    month,
    phase,
    daysInMonth: days,
    observedDays,
    fullyCovered: isMonthFullyCovered(month, coverage),
    lines,
    totals: {
      limitCents: limitTotal,
      actualWithinLimitsCents: actualWithinLimits,
      actualCents: actualTotal,
      projectedCents: phase === 'future' ? null : projectToMonthEnd(actualTotal, observedDays, days),
      averageCents: average.totalCents,
    },
    averageMonthsUsed: average.monthsUsed,
    ...result,
  };
}

/**
 * Sobra mensal medida: média de receita menos gasto nos últimos meses
 * completos com extrato cobrindo o mês inteiro, até `window` meses.
 *
 * É a base de viabilidade das metas. `null` quando nenhum mês completo existe:
 * sem medição, a tela diz que não sabe em vez de supor zero.
 */
export function measuredMonthlySurplus(
  transactions: TransactionInput[],
  coverage: CoverageRange[],
  today: Date,
  window = 3,
): { averageCents: bigint | null; monthsUsed: number } {
  const current = monthKeyOf(today);
  const months: MonthKey[] = [];
  for (let offset = 1; offset <= 12 && months.length < window; offset += 1) {
    const key = shiftMonth(current, -offset);
    if (isMonthFullyCovered(key, coverage)) months.push(key);
  }
  if (months.length === 0) return { averageCents: null, monthsUsed: 0 };
  const total = months.reduce((sum, key) => sum + monthResult(transactions, key).surplusCents, 0n);
  return { averageCents: divideRoundHalfUp(total, BigInt(months.length)), monthsUsed: months.length };
}
