/* Fórmulas financeiras do Dashboard.

   Módulo puro: sem Prisma, sem rede, sem relógio implícito. Recebe dados já
   carregados e devolve números. É assim que as fórmulas ganham teste unitário
   sem banco, conforme docs/DEVELOPMENT.md.

   Dinheiro sempre em centavos inteiros (BigInt). Nenhuma função formata texto:
   a formatação pertence à renderização (docs/DASHBOARD.md, R-25).

   As definições estão em docs/DASHBOARD.md, Parte 5. */

export type CategoryKind = 'income' | 'expense' | 'transfer';

export type TransactionInput = {
  accountId: string;
  occurredOn: Date;
  amountCents: bigint;
  status: string;
  categoryId: string | null;
  categoryKind: CategoryKind | null;
};

export type AccountBalanceInput = {
  accountId: string;
  snapshot: { balanceCents: bigint; capturedAt: Date } | null;
};

export type ObligationInput = {
  amountCents: bigint;
  dueDate: Date;
  status: string;
};

/** Lançamento pendente ainda não aconteceu: não entra em saldo nem em gasto. */
const isSettled = (transaction: TransactionInput) => transaction.status !== 'pending';

/** Transferência entre contas próprias não é receita nem despesa (docs/DASHBOARD.md, L-5). */
const isTransfer = (transaction: TransactionInput) => transaction.categoryKind === 'transfer';

/**
 * Divisão inteira com arredondamento half-up explícito.
 *
 * `BigInt` trunca por padrão, e truncar centavos silenciosamente é uma decisão
 * de arredondamento tomada por acidente (docs/DASHBOARD.md, D-15).
 */
export function divideRoundHalfUp(value: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) throw new RangeError('O divisor precisa ser positivo.');
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const quotient = (magnitude * 2n + divisor) / (divisor * 2n);
  return negative ? -quotient : quotient;
}

export type ConsolidatedBalance = {
  cents: bigint;
  /** Contas cujo saldo é conhecido e entrou na soma. */
  knownAccounts: number;
  /** Contas sem nenhum snapshot: o saldo é desconhecido, e desconhecido não é zero. */
  unknownAccounts: number;
};

/**
 * Saldo consolidado: último snapshot de cada conta mais os lançamentos
 * posteriores a ele.
 *
 * Somar apenas o snapshot ignora tudo que aconteceu depois (D-12). Tratar conta
 * sem snapshot como zero afirma que ela está zerada (D-13); aqui ela é contada
 * à parte para que a interface possa dizer que o número está incompleto.
 */
export function consolidatedBalance(
  accounts: AccountBalanceInput[],
  transactions: TransactionInput[],
): ConsolidatedBalance {
  let cents = 0n;
  let knownAccounts = 0;
  let unknownAccounts = 0;

  for (const account of accounts) {
    if (!account.snapshot) {
      unknownAccounts += 1;
      continue;
    }

    knownAccounts += 1;
    cents += account.snapshot.balanceCents;

    for (const transaction of transactions) {
      if (transaction.accountId !== account.accountId) continue;
      if (!isSettled(transaction)) continue;
      if (transaction.occurredOn <= account.snapshot.capturedAt) continue;
      cents += transaction.amountCents;
    }
  }

  return { cents, knownAccounts, unknownAccounts };
}

/** Despesa do período, como magnitude positiva. Exclui pendentes e transferências. */
export function expensesCents(transactions: TransactionInput[]): bigint {
  let total = 0n;
  for (const transaction of transactions) {
    if (!isSettled(transaction) || isTransfer(transaction)) continue;
    if (transaction.amountCents < 0n) total += -transaction.amountCents;
  }
  return total;
}

/** Receita do período. Exclui pendentes e transferências. */
export function incomeCents(transactions: TransactionInput[]): bigint {
  let total = 0n;
  for (const transaction of transactions) {
    if (!isSettled(transaction) || isTransfer(transaction)) continue;
    if (transaction.amountCents > 0n) total += transaction.amountCents;
  }
  return total;
}

/**
 * Média diária do período.
 *
 * O divisor é o número de dias decorridos, não o de dias com lançamento: um fim
 * de semana sem gasto faz parte do ritmo e não pode inflar a média.
 */
export function dailyAverageCents(expenseTotalCents: bigint, elapsedDays: number): bigint {
  if (!Number.isInteger(elapsedDays) || elapsedDays < 1) {
    throw new RangeError('O período precisa ter ao menos um dia decorrido.');
  }
  return divideRoundHalfUp(expenseTotalCents, BigInt(elapsedDays));
}

/**
 * Variação percentual contra uma base, com duas casas.
 *
 * Devolve `null` quando não existe base de comparação. Sem base, qualquer número
 * exibido seria inventado — inclusive "0%" (docs/DASHBOARD.md, R-4).
 */
export function percentChange(currentCents: bigint, previousCents: bigint): number | null {
  if (previousCents <= 0n) return null;
  return Number(divideRoundHalfUp((currentCents - previousCents) * 10_000n, previousCents)) / 100;
}

/**
 * Total comprometido: obrigações abertas com vencimento dentro do período.
 *
 * Só `open` é descontado. Obrigação paga ou cancelada que continuasse sendo
 * subtraída deixaria o veredito permanentemente pessimista (docs/DASHBOARD.md, L-1).
 */
export function committedCents(obligations: ObligationInput[], periodEnd: Date): bigint {
  let total = 0n;
  for (const obligation of obligations) {
    if (obligation.status !== 'open') continue;
    if (obligation.dueDate > periodEnd) continue;
    total += obligation.amountCents;
  }
  return total;
}

/**
 * Saldo Livre de Risco: o que sobra depois de tudo que já tem dono no período.
 *
 * Renda futura prevista não entra, de propósito: previsão de entrada não é
 * dinheiro disponível (docs/HOW-IT-WORKS.md).
 */
export function riskFreeBalanceCents(balanceCents: bigint, committedTotalCents: bigint): bigint {
  return balanceCents - committedTotalCents;
}

export type CategorySlice = {
  /** `null` representa lançamento sem categoria: aparece na tela, nunca é descartado. */
  categoryId: string | null;
  name: string;
  cents: bigint;
};

/**
 * Gastos por categoria, do maior para o menor.
 *
 * Lançamento sem categoria vira um grupo próprio em vez de sumir: omiti-lo faria
 * a soma das barras divergir do total de gastos sem que ninguém percebesse.
 * A cauda além de `limit` é somada em "Outros" (docs/DASHBOARD.md, G-2).
 */
export function categoryBreakdown(
  transactions: TransactionInput[],
  categoryNames: Map<string, string>,
  limit = 7,
): { slices: CategorySlice[]; totalCents: bigint } {
  const totals = new Map<string | null, bigint>();
  let totalCents = 0n;

  for (const transaction of transactions) {
    if (!isSettled(transaction) || isTransfer(transaction)) continue;
    if (transaction.amountCents >= 0n) continue;
    const magnitude = -transaction.amountCents;
    totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0n) + magnitude);
    totalCents += magnitude;
  }

  const ordered = [...totals.entries()]
    .map(([categoryId, cents]) => ({
      categoryId,
      name: categoryId === null ? 'Sem categoria' : categoryNames.get(categoryId) ?? 'Sem categoria',
      cents,
    }))
    .sort((left, right) => (right.cents > left.cents ? 1 : right.cents < left.cents ? -1 : 0));

  if (ordered.length <= limit) return { slices: ordered, totalCents };

  // O grupo sem categoria nunca é dobrado em "Outros": ele é o convite à
  // conciliação e some da vista justamente quando é pequeno demais para
  // aparecer sozinho no ranking.
  const uncategorized = ordered.find((slice) => slice.categoryId === null && slice.name === 'Sem categoria');
  const rankable = ordered.filter((slice) => slice !== uncategorized);

  const head = rankable.slice(0, uncategorized ? limit - 1 : limit);
  const tailCents = rankable.slice(head.length).reduce((sum, slice) => sum + slice.cents, 0n);

  const slices = [...head];
  if (uncategorized) slices.push(uncategorized);
  if (tailCents > 0n) slices.push({ categoryId: null, name: 'Outros', cents: tailCents });

  return { slices, totalCents };
}

export type PeriodRange = { start: Date; end: Date; elapsedDays: number };

/** Início do dia civil local. */
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

/** Último instante do dia civil local. */
const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/** Do dia 1 até o fim do dia de referência. */
export function monthToDate(reference: Date): PeriodRange {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1, 0, 0, 0, 0);
  return { start, end: endOfDay(reference), elapsedDays: reference.getDate() };
}

/**
 * Mesmo intervalo de dias do mês anterior.
 *
 * Comparar doze dias contra um mês inteiro produziria uma queda falsa em todo
 * início de mês. Meses mais curtos são truncados no último dia existente.
 */
export function previousMonthToDate(reference: Date): PeriodRange {
  const start = new Date(reference.getFullYear(), reference.getMonth() - 1, 1, 0, 0, 0, 0);
  const lastDayOfPreviousMonth = new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();
  const day = Math.min(reference.getDate(), lastDayOfPreviousMonth);
  const end = endOfDay(new Date(start.getFullYear(), start.getMonth(), day));
  return { start, end, elapsedDays: day };
}

/** Fim do mês civil de referência: o horizonte padrão do Saldo Livre de Risco. */
export function endOfMonth(reference: Date): Date {
  return endOfDay(new Date(reference.getFullYear(), reference.getMonth() + 1, 0));
}

export { startOfDay };
