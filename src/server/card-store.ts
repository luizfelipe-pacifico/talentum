/* Borda de dados dos cartões (Stage 8).

   Esquemas de entrada, leitura escopada por perfil e serialização para as rotas
   de `/api/cards*`, `/api/card-statements*`, `/api/card-benefits*` e
   `/api/card-statement-checks`. As regras de negócio puras ficam em
   `src/server/cards.ts`.

   Toda consulta filtra por `profileId`: um id opaco não é autorização
   (docs/DATABASE.md, §4). Dinheiro viaja como centavos inteiros em string. */

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/server/db';
import {
  daysUntil,
  feeWaiverProgress,
  itemsTotalCents,
  nextStatementCycle,
  outstandingCents,
  spendOfItems,
  statementStatusAfterPayments,
  type StatementStatus,
} from '@/server/cards';

/* ── Esquemas de entrada ───────────────────────────────────────── */

/** Data civil `AAAA-MM-DD`, validada de verdade (31/02 é recusado). */
export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value, context) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (year < 1980 || year > 2200 || date.getMonth() !== month - 1 || date.getDate() !== day) {
      context.addIssue({ code: 'custom', message: 'data inválida' });
      return z.NEVER;
    }
    return date;
  });

/** Centavos não negativos, até R$ 9.999.999.999.999,99. */
export const positiveCents = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform((value) => BigInt(value));

/** Centavos com sinal, diferentes de zero. */
export const signedCents = z
  .string()
  .regex(/^-?\d{1,15}$/)
  .transform((value) => BigInt(value))
  .refine((value) => value !== 0n, 'zero não é lançamento');

const opaqueId = z.string().trim().min(1).max(64);
const day = z.number().int().min(1).max(31);

export const cardCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    institutionId: opaqueId.optional(),
    institutionName: z.string().trim().min(1).max(120).optional(),
    paymentAccountId: opaqueId.nullable().optional(),
    // Só os quatro últimos dígitos, e só se a pessoa quiser. Nunca o número.
    lastFourDigits: z.string().regex(/^\d{4}$/).nullable().optional(),
    closingDay: day.nullable().optional(),
    dueDay: day,
    limitCents: positiveCents.nullable().optional(),
    annualFeeCents: positiveCents.nullable().optional(),
    feeWaiverSpendCents: positiveCents.nullable().optional(),
    feeWaiverPeriod: z.enum(['statement', 'year']).nullable().optional(),
  })
  .refine(
    (value) => (value.feeWaiverSpendCents == null) === (value.feeWaiverPeriod == null),
    'regra de isenção exige valor e período',
  );

export const cardPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    paymentAccountId: opaqueId.nullable().optional(),
    lastFourDigits: z.string().regex(/^\d{4}$/).nullable().optional(),
    closingDay: day.nullable().optional(),
    dueDay: day.optional(),
    limitCents: positiveCents.nullable().optional(),
    annualFeeCents: positiveCents.nullable().optional(),
    feeWaiverSpendCents: positiveCents.nullable().optional(),
    feeWaiverPeriod: z.enum(['statement', 'year']).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'nada a alterar');

export const statementCreateSchema = z
  .object({
    periodStart: civilDate.nullable().optional(),
    closingDate: civilDate,
    dueDate: civilDate,
    totalCents: positiveCents,
    isEstimated: z.boolean().default(false),
  })
  .refine((value) => value.dueDate >= value.closingDate, 'o vencimento vem depois do fechamento');

export const statementPatchSchema = z
  .object({
    closingDate: civilDate.optional(),
    dueDate: civilDate.optional(),
    totalCents: positiveCents.optional(),
    isEstimated: z.boolean().optional(),
    /** Cancelar ou reabrir. `paid` é consequência dos pagamentos, nunca escolhido à mão. */
    status: z.enum(['open', 'cancelled']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'nada a alterar');

export const itemCreateSchema = z
  .object({
    occurredOn: civilDate,
    description: z.string().trim().min(1).max(200),
    amountCents: signedCents,
    installmentNumber: z.number().int().min(1).max(120).nullable().optional(),
    installmentCount: z.number().int().min(1).max(120).nullable().optional(),
    /** Chave gerada pelo formulário: reenviar o mesmo formulário não duplica o item. */
    clientKey: z.string().uuid(),
  })
  .refine(
    (value) =>
      value.installmentNumber == null ||
      (value.installmentCount != null && value.installmentNumber <= value.installmentCount),
    'parcela fora do total de parcelas',
  );

export const paymentCreateSchema = z.object({ transactionId: opaqueId });

export const BENEFIT_KINDS = ['cashback', 'points', 'miles'] as const;

export const benefitCreateSchema = z.object({
  kind: z.enum(BENEFIT_KINDS),
  programName: z.string().trim().min(1).max(80),
  /** Cashback em centavos; pontos e milhas em unidades. */
  balance: positiveCents,
  expiringBalance: positiveCents.nullable().optional(),
  expiresOn: civilDate.nullable().optional(),
});

export const benefitPatchSchema = z
  .object({
    programName: z.string().trim().min(1).max(80).optional(),
    balance: positiveCents.optional(),
    expiringBalance: positiveCents.nullable().optional(),
    expiresOn: civilDate.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'nada a alterar');

/* ── Utilidades ────────────────────────────────────────────────── */

export const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);
export const cents = (value: bigint | null | undefined) => (value === null || value === undefined ? null : value.toString());

/** Violação de unicidade do Prisma: a escrita repetida já existe. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Registro sumiu entre a leitura e a escrita (corrida com outra aba). */
export function isMissingRecord(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

type Tx = Prisma.TransactionClient;

/**
 * Recalcula a situação da fatura a partir dos pagamentos conciliados.
 *
 * Chamado dentro da mesma transação que criou, removeu um pagamento ou mudou o
 * total: a situação nunca fica para trás do que está gravado.
 */
export async function refreshStatementStatus(tx: Tx, statementId: string): Promise<StatementStatus> {
  const statement = await tx.cardStatement.findUniqueOrThrow({
    where: { id: statementId },
    select: { status: true, totalCents: true, payments: { select: { amountCents: true } } },
  });
  const paid = statement.payments.reduce((total, payment) => total + payment.amountCents, 0n);
  const status = statementStatusAfterPayments(statement.status as StatementStatus, statement.totalCents, paid);
  if (status !== statement.status) {
    await tx.cardStatement.update({ where: { id: statementId }, data: { status } });
  }
  return status;
}

/* ── Leitura ───────────────────────────────────────────────────── */

const statementSelect = {
  id: true,
  periodStart: true,
  closingDate: true,
  dueDate: true,
  totalCents: true,
  isEstimated: true,
  status: true,
  payments: { select: { amountCents: true } },
  items: { select: { amountCents: true } },
} as const;

type StatementRow = Prisma.CardStatementGetPayload<{ select: typeof statementSelect }>;

export function serializeStatementSummary(statement: StatementRow) {
  const paid = statement.payments.reduce((total, payment) => total + payment.amountCents, 0n);
  return {
    id: statement.id,
    periodStart: iso(statement.periodStart),
    closingDate: iso(statement.closingDate),
    dueDate: iso(statement.dueDate),
    totalCents: statement.totalCents.toString(),
    paidCents: paid.toString(),
    outstandingCents:
      statement.status === 'open' ? outstandingCents(statement.totalCents, paid).toString() : '0',
    isEstimated: statement.isEstimated,
    status: statement.status,
    itemCount: statement.items.length,
    itemsTotalCents: itemsTotalCents(statement.items).toString(),
  };
}

const cardSelect = {
  id: true,
  name: true,
  lastFourDigits: true,
  closingDay: true,
  dueDay: true,
  limitCents: true,
  annualFeeCents: true,
  feeWaiverSpendCents: true,
  feeWaiverPeriod: true,
  isActive: true,
  institution: { select: { id: true, name: true } },
  paymentAccount: { select: { id: true, name: true } },
} as const;

type CardRow = Prisma.CreditCardGetPayload<{ select: typeof cardSelect }>;

function serializeCardBase(card: CardRow, reference: Date) {
  const cycle = nextStatementCycle({ closingDay: card.closingDay, dueDay: card.dueDay }, reference);
  return {
    id: card.id,
    name: card.name,
    lastFourDigits: card.lastFourDigits,
    institution: card.institution,
    paymentAccount: card.paymentAccount,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    limitCents: cents(card.limitCents),
    annualFeeCents: cents(card.annualFeeCents),
    feeWaiver:
      card.feeWaiverSpendCents !== null && card.feeWaiverPeriod
        ? { thresholdCents: card.feeWaiverSpendCents.toString(), period: card.feeWaiverPeriod }
        : null,
    isActive: card.isActive,
    nextCycle: {
      periodStart: iso(cycle.periodStart),
      closingDate: iso(cycle.closingDate),
      dueDate: iso(cycle.dueDate),
      closingIsEstimated: cycle.closingIsEstimated,
    },
  };
}

/** Lista de cartões do perfil, com a fatura em aberto mais próxima de cada um. */
export async function listCards(profileId: string, reference: Date) {
  const cards = await db.creditCard.findMany({
    where: { profileId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      ...cardSelect,
      statements: {
        where: { status: 'open' },
        orderBy: { dueDate: 'asc' },
        take: 1,
        select: statementSelect,
      },
      _count: { select: { statements: true } },
    },
  });

  return cards.map((card) => ({
    ...serializeCardBase(card, reference),
    statementCount: card._count.statements,
    openStatement: card.statements[0] ? serializeStatementSummary(card.statements[0]) : null,
  }));
}

/** Detalhe do cartão: faturas, benefícios e termômetro de isenção. */
export async function loadCardDetail(profileId: string, cardId: string, reference: Date) {
  const card = await db.creditCard.findFirst({
    where: { id: cardId, profileId },
    select: {
      ...cardSelect,
      statements: { orderBy: { dueDate: 'desc' }, take: 24, select: statementSelect },
      benefits: {
        orderBy: [{ kind: 'asc' }, { programName: 'asc' }],
        select: { id: true, kind: true, programName: true, balance: true, expiringBalance: true, expiresOn: true },
      },
    },
  });
  if (!card) return null;

  // O gasto de cada fatura é a soma das cobranças; sem itens lançados, o total
  // declarado é a melhor informação disponível.
  const spendStatements = await db.cardStatement.findMany({
    where: { profileId, creditCardId: card.id },
    select: { dueDate: true, status: true, totalCents: true, items: { select: { amountCents: true } } },
  });
  const feeWaiver = feeWaiverProgress(
    card.feeWaiverSpendCents !== null && card.feeWaiverPeriod
      ? { thresholdCents: card.feeWaiverSpendCents, period: card.feeWaiverPeriod as 'statement' | 'year' }
      : null,
    spendStatements.map((statement) => ({
      dueDate: statement.dueDate,
      status: statement.status,
      spendCents: statement.items.length > 0 ? spendOfItems(statement.items) : statement.totalCents,
    })),
    reference,
  );

  return {
    ...serializeCardBase(card, reference),
    statements: card.statements.map(serializeStatementSummary),
    benefits: card.benefits.map((benefit) => ({
      id: benefit.id,
      kind: benefit.kind,
      programName: benefit.programName,
      balance: benefit.balance.toString(),
      expiringBalance: cents(benefit.expiringBalance),
      expiresOn: iso(benefit.expiresOn),
      daysUntilExpiry: daysUntil(benefit.expiresOn, reference),
    })),
    feeWaiver: feeWaiver
      ? {
          period: feeWaiver.period,
          thresholdCents: feeWaiver.thresholdCents.toString(),
          spentCents: feeWaiver.spentCents.toString(),
          remainingCents: feeWaiver.remainingCents.toString(),
          percent: feeWaiver.percent,
          met: feeWaiver.met,
          basisDueDate: iso(feeWaiver.basisDueDate),
        }
      : null,
  };
}

/** Fatura do perfil com o cartão, ou `null`. */
export function findStatement(profileId: string, statementId: string) {
  return db.cardStatement.findFirst({
    where: { id: statementId, profileId },
    select: {
      id: true,
      status: true,
      totalCents: true,
      dueDate: true,
      creditCard: { select: { id: true, name: true, paymentAccountId: true } },
    },
  });
}
