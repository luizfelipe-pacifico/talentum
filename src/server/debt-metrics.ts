/* Fórmulas de dívidas e do modo sobrevivência (Stage 13 de docs/ROADMAP.md).

   Módulo puro: sem Prisma, sem rede, sem relógio implícito. Centavos em BigInt
   e taxa mensal em pontos-base inteiros (1.250 = 12,5% ao mês).

   O plano de quitação é uma simulação educativa com juros compostos mensais
   sobre o saldo, sem multa, IOF, encargo de atraso ou renegociação: o contrato
   real pode divergir, e a tela diz isso. Não é orientação jurídica nem
   financeira individual. */

import { divideRoundHalfUp } from './dashboard-metrics.ts';

export type DebtInput = {
  id: string;
  name: string;
  principalCents: bigint;
  monthlyRateBps: number;
  minimumPaymentCents: bigint;
  overdueCents: bigint;
};

export type PayoffStrategy = 'avalanche' | 'snowball';

/**
 * Ordem de prioridade para o pagamento extra.
 *
 * - `avalanche`: maior taxa primeiro (menor custo total de juros);
 * - `snowball`: menor saldo primeiro (quitações mais cedo).
 *
 * Empates caem para o critério do outro método e, por fim, para o nome, para
 * que a ordem seja estável.
 */
export function orderDebts<T extends DebtInput>(debts: T[], strategy: PayoffStrategy): T[] {
  const byRate = (left: T, right: T) => right.monthlyRateBps - left.monthlyRateBps;
  const byBalance = (left: T, right: T) =>
    left.principalCents < right.principalCents ? -1 : left.principalCents > right.principalCents ? 1 : 0;
  return [...debts].sort((left, right) => {
    const first = strategy === 'avalanche' ? byRate(left, right) : byBalance(left, right);
    if (first !== 0) return first;
    const second = strategy === 'avalanche' ? byBalance(left, right) : byRate(left, right);
    if (second !== 0) return second;
    return left.name.localeCompare(right.name, 'pt-BR') || left.id.localeCompare(right.id);
  });
}

/** Juros de um mês sobre o saldo, com arredondamento half-up no centavo. */
export function monthlyInterestCents(balanceCents: bigint, monthlyRateBps: number): bigint {
  if (balanceCents <= 0n || monthlyRateBps <= 0) return 0n;
  return divideRoundHalfUp(balanceCents * BigInt(monthlyRateBps), 10_000n);
}

/** Taxa anual equivalente em pontos-base, `(1 + i)^12 - 1`, para exibição. */
export function annualEquivalentBps(monthlyRateBps: number): number {
  if (monthlyRateBps <= 0) return 0;
  return Math.round(((1 + monthlyRateBps / 10_000) ** 12 - 1) * 10_000);
}

export type PayoffMonth = {
  /** Mês da simulação, a partir de 1. */
  month: number;
  payments: { debtId: string; interestCents: bigint; paidCents: bigint; balanceCents: bigint }[];
  totalPaidCents: bigint;
  totalBalanceCents: bigint;
};

export type PayoffPlan =
  | {
      status: 'ok';
      strategy: PayoffStrategy;
      order: string[];
      months: PayoffMonth[];
      monthsToPayoff: number;
      totalInterestCents: bigint;
      totalPaidCents: bigint;
      /** Mês em que cada dívida zera. */
      payoffMonth: Record<string, number>;
    }
  | { status: 'insufficient'; minimumTotalCents: bigint }
  | { status: 'no_debts' }
  | { status: 'too_long'; horizonMonths: number };

/**
 * Plano de quitação mês a mês.
 *
 * A cada mês: os juros incidem sobre o saldo; a parcela mínima de cada dívida
 * é paga (ou o saldo, se menor); o que sobra do orçamento mensal vai para a
 * primeira dívida da ordem escolhida. Quando uma dívida zera, a parcela dela
 * passa a reforçar a próxima (efeito "bola de neve"), porque o orçamento
 * mensal é constante.
 *
 * Recusa o plano quando o orçamento não cobre a soma das parcelas mínimas, e
 * para em `horizonMonths` quando o orçamento mal cobre os juros.
 */
export function payoffPlan(
  debts: DebtInput[],
  monthlyBudgetCents: bigint,
  strategy: PayoffStrategy,
  horizonMonths = 600,
): PayoffPlan {
  const open = debts.filter((debt) => debt.principalCents > 0n);
  if (open.length === 0) return { status: 'no_debts' };

  const minimumTotal = open.reduce((sum, debt) => sum + debt.minimumPaymentCents, 0n);
  if (monthlyBudgetCents < minimumTotal || monthlyBudgetCents <= 0n) {
    return { status: 'insufficient', minimumTotalCents: minimumTotal };
  }

  const ordered = orderDebts(open, strategy);
  const balances = new Map(ordered.map((debt) => [debt.id, debt.principalCents]));
  const payoffMonth: Record<string, number> = {};
  const months: PayoffMonth[] = [];
  let totalInterest = 0n;
  let totalPaid = 0n;

  for (let month = 1; month <= horizonMonths; month += 1) {
    const interest = new Map<string, bigint>();
    const paid = new Map<string, bigint>();

    for (const debt of ordered) {
      const balance = balances.get(debt.id) as bigint;
      if (balance <= 0n) continue;
      const charged = monthlyInterestCents(balance, debt.monthlyRateBps);
      interest.set(debt.id, charged);
      balances.set(debt.id, balance + charged);
      totalInterest += charged;
    }

    let budget = monthlyBudgetCents;
    for (const debt of ordered) {
      const balance = balances.get(debt.id) as bigint;
      if (balance <= 0n) continue;
      const due = debt.minimumPaymentCents < balance ? debt.minimumPaymentCents : balance;
      const payment = due < budget ? due : budget;
      balances.set(debt.id, balance - payment);
      paid.set(debt.id, payment);
      budget -= payment;
    }
    for (const debt of ordered) {
      if (budget <= 0n) break;
      const balance = balances.get(debt.id) as bigint;
      if (balance <= 0n) continue;
      const extra = budget < balance ? budget : balance;
      balances.set(debt.id, balance - extra);
      paid.set(debt.id, (paid.get(debt.id) ?? 0n) + extra);
      budget -= extra;
    }

    let monthPaid = 0n;
    let monthBalance = 0n;
    const payments = ordered
      .filter((debt) => interest.has(debt.id))
      .map((debt) => {
        const balance = balances.get(debt.id) as bigint;
        const paidCents = paid.get(debt.id) ?? 0n;
        monthPaid += paidCents;
        monthBalance += balance;
        if (balance === 0n && payoffMonth[debt.id] === undefined) payoffMonth[debt.id] = month;
        return { debtId: debt.id, interestCents: interest.get(debt.id) as bigint, paidCents, balanceCents: balance };
      });
    totalPaid += monthPaid;
    months.push({ month, payments, totalPaidCents: monthPaid, totalBalanceCents: monthBalance });

    if (monthBalance === 0n) {
      return {
        status: 'ok',
        strategy,
        order: ordered.map((debt) => debt.id),
        months,
        monthsToPayoff: month,
        totalInterestCents: totalInterest,
        totalPaidCents: totalPaid,
        payoffMonth,
      };
    }
  }

  return { status: 'too_long', horizonMonths };
}

export type SurvivalReason = 'negative_risk_free_balance' | 'overdue_debt';

/**
 * Modo sobrevivência: foco em liquidez e em dívida cara.
 *
 * Ativo quando o Saldo Livre de Risco conhecido está negativo ou quando alguma
 * dívida tem valor em atraso. Saldo desconhecido não ativa nada: sem conta com
 * saldo informado, o sistema não afirma que falta dinheiro.
 */
export function survivalStatus(input: {
  riskFreeBalanceCents: bigint | null;
  debts: Pick<DebtInput, 'overdueCents'>[];
}): { active: boolean; reasons: SurvivalReason[] } {
  const reasons: SurvivalReason[] = [];
  if (input.riskFreeBalanceCents !== null && input.riskFreeBalanceCents < 0n) reasons.push('negative_risk_free_balance');
  if (input.debts.some((debt) => debt.overdueCents > 0n)) reasons.push('overdue_debt');
  return { active: reasons.length > 0, reasons };
}

/**
 * Gasto confirmado do período separado em essencial e não essencial.
 *
 * Gasto sem categoria fica numa terceira coluna: classificá-lo como não
 * essencial por padrão seria uma afirmação que o sistema não pode fazer.
 */
export function essentialSplit(
  spending: Map<string | null, bigint>,
  essentialIds: Set<string>,
): { essentialCents: bigint; nonEssentialCents: bigint; uncategorizedCents: bigint } {
  let essentialCents = 0n;
  let nonEssentialCents = 0n;
  let uncategorizedCents = 0n;
  for (const [categoryId, cents] of spending) {
    if (categoryId === null) uncategorizedCents += cents;
    else if (essentialIds.has(categoryId)) essentialCents += cents;
    else nonEssentialCents += cents;
  }
  return { essentialCents, nonEssentialCents, uncategorizedCents };
}
