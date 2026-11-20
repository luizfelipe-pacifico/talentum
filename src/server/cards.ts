import { createHash } from 'node:crypto';

/* Regras de cartão, fatura e benefício (Stage 8).

   Módulo puro: sem Prisma, sem rede, sem relógio implícito. As rotas carregam os
   dados e chamam estas funções; os testes as exercitam sem banco
   (docs/BEST_PRACTICES.md). Dinheiro em centavos inteiros (BigInt). */

/** Último dia do mês civil (mês de 0 a 11). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Dia `day` do mês, ou o último dia quando o mês é mais curto (31 em fevereiro). */
export function clampedDay(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, lastDayOfMonth(year, month)), 0, 0, 0, 0);
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

export type StatementCycle = {
  /** Dia seguinte ao fechamento anterior: primeiro dia coberto pela fatura. */
  periodStart: Date;
  closingDate: Date;
  dueDate: Date;
};

/**
 * Próximo ciclo de fatura a partir de uma data.
 *
 * O fechamento é o primeiro `closingDay` igual ou posterior à referência; o
 * vencimento é o primeiro `dueDay` depois do fechamento. Sem dia de fechamento
 * conhecido, o ciclo é aproximado pelo vencimento (fechamento sete dias antes),
 * e a interface declara que é aproximação.
 */
export function nextStatementCycle(
  card: { closingDay: number | null; dueDay: number },
  reference: Date,
): StatementCycle & { closingIsEstimated: boolean } {
  const today = startOfDay(reference);

  if (card.closingDay === null) {
    let due = clampedDay(today.getFullYear(), today.getMonth(), card.dueDay);
    if (due < today) due = clampedDay(today.getFullYear(), today.getMonth() + 1, card.dueDay);
    const closingDate = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 7);
    const previousClosing = new Date(closingDate.getFullYear(), closingDate.getMonth() - 1, closingDate.getDate());
    return {
      periodStart: new Date(previousClosing.getFullYear(), previousClosing.getMonth(), previousClosing.getDate() + 1),
      closingDate,
      dueDate: due,
      closingIsEstimated: true,
    };
  }

  let closingDate = clampedDay(today.getFullYear(), today.getMonth(), card.closingDay);
  if (closingDate < today) closingDate = clampedDay(today.getFullYear(), today.getMonth() + 1, card.closingDay);

  let dueDate = clampedDay(closingDate.getFullYear(), closingDate.getMonth(), card.dueDay);
  if (dueDate <= closingDate) dueDate = clampedDay(closingDate.getFullYear(), closingDate.getMonth() + 1, card.dueDay);

  const previousClosing = clampedDay(closingDate.getFullYear(), closingDate.getMonth() - 1, card.closingDay);
  return {
    periodStart: new Date(previousClosing.getFullYear(), previousClosing.getMonth(), previousClosing.getDate() + 1),
    closingDate,
    dueDate,
    closingIsEstimated: false,
  };
}

export type StatementStatus = 'open' | 'paid' | 'cancelled';

/** Quanto falta pagar. Nunca negativo: pagar a mais não cria dívida ao contrário. */
export function outstandingCents(totalCents: bigint, paidCents: bigint): bigint {
  const rest = totalCents - paidCents;
  return rest > 0n ? rest : 0n;
}

/** Situação da fatura depois de um pagamento conciliado ou desfeito. */
export function statementStatusAfterPayments(
  current: StatementStatus,
  totalCents: bigint,
  paidCents: bigint,
): StatementStatus {
  if (current === 'cancelled') return 'cancelled';
  return paidCents >= totalCents && totalCents > 0n ? 'paid' : 'open';
}

/** Soma dos itens: cobranças positivas, créditos negativos. */
export function itemsTotalCents(items: { amountCents: bigint }[]): bigint {
  return items.reduce((total, item) => total + item.amountCents, 0n);
}

/* ── Termômetro de isenção da anuidade ─────────────────────────── */

export type FeeWaiverRule = {
  thresholdCents: bigint;
  /** `statement`: gasto de uma fatura; `year`: gasto das faturas do ano civil. */
  period: 'statement' | 'year';
};

export type FeeWaiverProgress = {
  period: 'statement' | 'year';
  thresholdCents: bigint;
  spentCents: bigint;
  remainingCents: bigint;
  /** Porcentagem inteira de 0 a 100, para a barra. */
  percent: number;
  met: boolean;
  /** Vencimento da fatura usada como base, quando o período é por fatura. */
  basisDueDate: Date | null;
};

type StatementForSpend = {
  dueDate: Date;
  status: string;
  /** Gasto da fatura: soma das cobranças, sem créditos. */
  spendCents: bigint;
};

/**
 * Quanto falta gastar no período para isentar a anuidade.
 *
 * Gasto é a soma das cobranças (compras e parcelas); estornos e pagamentos não
 * contam como gasto. Por fatura, a base é a fatura aberta mais próxima do
 * vencimento; sem fatura aberta, a mais recente. Por ano, as faturas que
 * vencem no ano civil da referência. Sem regra, não há termômetro: um 0% sem
 * regra afirmaria uma meta que o cartão não tem.
 */
export function feeWaiverProgress(
  rule: FeeWaiverRule | null,
  statements: StatementForSpend[],
  reference: Date,
): FeeWaiverProgress | null {
  if (!rule || rule.thresholdCents <= 0n) return null;
  const counted = statements.filter((statement) => statement.status !== 'cancelled');

  let spentCents = 0n;
  let basisDueDate: Date | null = null;

  if (rule.period === 'year') {
    const year = reference.getFullYear();
    for (const statement of counted) {
      if (statement.dueDate.getFullYear() === year) spentCents += statement.spendCents;
    }
  } else {
    const open = counted
      .filter((statement) => statement.status === 'open')
      .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
    const latest = [...counted].sort((left, right) => right.dueDate.getTime() - left.dueDate.getTime());
    const basis = open[0] ?? latest[0] ?? null;
    if (basis) {
      spentCents = basis.spendCents;
      basisDueDate = basis.dueDate;
    }
  }

  const remainingCents = spentCents >= rule.thresholdCents ? 0n : rule.thresholdCents - spentCents;
  const percent = Number((spentCents >= rule.thresholdCents ? rule.thresholdCents : spentCents) * 100n / rule.thresholdCents);

  return {
    period: rule.period,
    thresholdCents: rule.thresholdCents,
    spentCents,
    remainingCents,
    percent,
    met: remainingCents === 0n,
    basisDueDate,
  };
}

/** Gasto de uma fatura: só as cobranças. */
export function spendOfItems(items: { amountCents: bigint }[]): bigint {
  return items.reduce((total, item) => (item.amountCents > 0n ? total + item.amountCents : total), 0n);
}

/* ── Conferência: fatura contra o extrato da conta ─────────────── */

export type PaymentCandidateInput = {
  id: string;
  accountId: string;
  occurredOn: Date;
  amountCents: bigint;
};

export type PaymentCandidate = PaymentCandidateInput & {
  /** `exact`: paga exatamente o que falta. `partial`: paga parte. */
  match: 'exact' | 'partial';
  /** Dias de distância do vencimento; negativo é antes. */
  daysFromDue: number;
};

/** Janela em torno do vencimento em que um débito pode ser o pagamento da fatura. */
export const PAYMENT_WINDOW_DAYS_BEFORE = 15;
export const PAYMENT_WINDOW_DAYS_AFTER = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lançamentos da conta que podem ser o pagamento da fatura.
 *
 * Candidato é uma saída (valor negativo) dentro da janela do vencimento, de
 * valor igual ao que falta (`exact`) ou menor (`partial`, pagamento parcial).
 * Lançamento já ligado a outra fatura não entra. Quando a fatura tem conta de
 * pagamento, só os lançamentos dela contam. Ordem: exato primeiro, depois o
 * mais perto do vencimento. A pessoa confirma; nada é ligado sozinho.
 */
export function paymentCandidates(
  statement: { dueDate: Date; outstandingCents: bigint; paymentAccountId: string | null },
  transactions: PaymentCandidateInput[],
  alreadyLinked: Set<string>,
): PaymentCandidate[] {
  if (statement.outstandingCents <= 0n) return [];
  const due = startOfDay(statement.dueDate).getTime();

  const candidates: PaymentCandidate[] = [];
  for (const transaction of transactions) {
    if (alreadyLinked.has(transaction.id)) continue;
    if (transaction.amountCents >= 0n) continue;
    if (statement.paymentAccountId && transaction.accountId !== statement.paymentAccountId) continue;
    const daysFromDue = Math.round((startOfDay(transaction.occurredOn).getTime() - due) / DAY_MS);
    if (daysFromDue < -PAYMENT_WINDOW_DAYS_BEFORE || daysFromDue > PAYMENT_WINDOW_DAYS_AFTER) continue;
    const magnitude = -transaction.amountCents;
    if (magnitude > statement.outstandingCents) continue;
    candidates.push({ ...transaction, match: magnitude === statement.outstandingCents ? 'exact' : 'partial', daysFromDue });
  }

  return candidates.sort((left, right) => {
    if (left.match !== right.match) return left.match === 'exact' ? -1 : 1;
    return Math.abs(left.daysFromDue) - Math.abs(right.daysFromDue);
  });
}

/* ── Benefícios ────────────────────────────────────────────────── */

/** Dias até a expiração; `null` sem data. Negativo quando já expirou. */
export function daysUntil(date: Date | null, reference: Date): number | null {
  if (!date) return null;
  return Math.round((startOfDay(date).getTime() - startOfDay(reference).getTime()) / DAY_MS);
}

/** Aviso de expiração: até 60 dias à frente, como os programas costumam avisar. */
export const BENEFIT_EXPIRY_WARNING_DAYS = 60;

/* ── Itens importados de arquivo ───────────────────────────────── */

export type ImportedEntry = { occurredOn: Date; description: string; amountCents: bigint };

export type CardItemDraft = {
  occurredOn: Date;
  description: string;
  /** Convenção da fatura: positivo é cobrança, negativo é crédito. */
  amountCents: bigint;
  installmentNumber: number | null;
  installmentCount: number | null;
  /** Chave de idempotência: a mesma linha importada de novo não duplica o item. */
  externalId: string;
};

/** Parcela no fim da descrição: "PARC 02/10", "02/10" ou "2 de 10". */
export function readInstallment(description: string): { number: number; count: number } | null {
  const match = description.match(/(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i);
  if (!match) return null;
  const number = Number(match[1]);
  const count = Number(match[2]);
  if (number < 1 || count < 2 || number > count) return null;
  return { number, count };
}

/**
 * Converte lançamentos lidos de um extrato (CSV, OFX ou PDF) em itens de fatura.
 *
 * Os leitores devolvem a convenção do extrato (negativo é saída); na fatura, a
 * compra é cobrança positiva. A chave de cada item é o hash de dia, valor e
 * descrição mais a ordem da ocorrência no arquivo: duas compras idênticas no
 * mesmo dia continuam sendo duas, e o mesmo arquivo importado de novo produz
 * as mesmas chaves.
 */
export function cardItemsFromEntries(entries: ImportedEntry[]): CardItemDraft[] {
  const occurrences = new Map<string, number>();
  return entries.map((entry) => {
    const base = `${entry.occurredOn.getFullYear()}-${entry.occurredOn.getMonth() + 1}-${entry.occurredOn.getDate()}|${entry.amountCents}|${entry.description}`;
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    const hash = createHash('sha256').update(base, 'utf8').digest('hex').slice(0, 32);
    const installment = readInstallment(entry.description);
    return {
      occurredOn: entry.occurredOn,
      description: entry.description,
      amountCents: -entry.amountCents,
      installmentNumber: installment?.number ?? null,
      installmentCount: installment?.count ?? null,
      externalId: `import:${hash}:${occurrence}`,
    };
  });
}
