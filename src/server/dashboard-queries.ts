/* Consultas compartilhadas do painel.

   O saldo consolidado alimenta o veredito, a projeção de caixa e o detalhe do
   Saldo Livre de Risco. Ele mora aqui para que as três rotas leiam exatamente o
   mesmo número — duas implementações do mesmo saldo divergiriam em silêncio na
   primeira mudança de regra.

   Toda consulta é escopada por `profileId` (docs/DATABASE.md, §4). */

import { db } from '@/server/db';
import {
  cardStatementObligations,
  consolidatedBalance,
  splitByReferenceCurrency,
  withoutBillsCoveredByStatements,
  type ConsolidatedBalance,
  type CategoryKind,
  type TransactionInput,
} from '@/server/dashboard-metrics';

/** Colunas mínimas que as fórmulas consomem. Nenhuma descrição de lançamento. */
const transactionSelect = {
  accountId: true,
  occurredOn: true,
  amountCents: true,
  status: true,
  categoryId: true,
  category: { select: { kind: true } },
} as const;

type TransactionRow = {
  accountId: string;
  occurredOn: Date;
  amountCents: bigint;
  status: string;
  categoryId: string | null;
  category: { kind: string } | null;
};

export function toTransactionInput(row: TransactionRow): TransactionInput {
  return {
    accountId: row.accountId,
    occurredOn: row.occurredOn,
    amountCents: row.amountCents,
    status: row.status,
    categoryId: row.categoryId,
    categoryKind: (row.category?.kind as CategoryKind | undefined) ?? null,
  };
}

/**
 * Saldo consolidado das contas ativas na moeda de referência.
 *
 * Último snapshot de cada conta mais os lançamentos posteriores a ele. Conta sem
 * snapshot é contada à parte: desconhecido não é zero (docs/PRODUCT.md, I-1).
 * Conta em outra moeda também fica de fora e é contada em
 * `accountsInOtherCurrency`, para a tela dizer que o número não a inclui (L-4).
 * O veredito (`GET /api/dashboard`) e a projeção leem esta mesma função.
 */
export async function loadConsolidatedBalance(
  profileId: string,
): Promise<ConsolidatedBalance & { accountsInOtherCurrency: number }> {
  const active = await db.account.findMany({
    where: { profileId, isActive: true },
    select: {
      id: true,
      currency: true,
      balanceSnapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
        select: { balanceCents: true, capturedAt: true },
      },
    },
  });

  const { included: accounts, excludedCount } = splitByReferenceCurrency(active);

  // Os lançamentos posteriores ao snapshot podem ser anteriores ao período
  // exibido, então a janela começa no snapshot mais antigo entre as contas.
  const oldestCapture = accounts.reduce<Date | null>((oldest, account) => {
    const capturedAt = account.balanceSnapshots[0]?.capturedAt;
    if (!capturedAt) return oldest;
    return !oldest || capturedAt < oldest ? capturedAt : oldest;
  }, null);

  const settlementRows = oldestCapture
    ? await db.transaction.findMany({
        where: { profileId, occurredOn: { gt: oldestCapture } },
        select: transactionSelect,
      })
    : [];

  const balance = consolidatedBalance(
    accounts.map((account) => ({
      accountId: account.id,
      snapshot: account.balanceSnapshots[0] ?? null,
    })),
    settlementRows.map(toTransactionInput),
  );
  return { ...balance, accountsInOtherCurrency: excludedCount };
}

/** Obrigações abertas com vencimento até o limite informado. */
export async function loadOpenObligations(profileId: string, until: Date) {
  return db.scheduledObligation.findMany({
    where: { profileId, status: 'open', dueDate: { lte: until } },
    orderBy: { dueDate: 'asc' },
    select: { id: true, description: true, amountCents: true, dueDate: true, status: true, isEstimated: true, creditCardId: true },
  });
}

/**
 * Faturas de cartão em aberto com vencimento até o limite, com o total já pago.
 *
 * Entram no comprometido do período pelo que ainda falta pagar
 * (`cardStatementObligations`, docs/PRODUCT.md, V). A descrição usa só o apelido
 * do cartão, nunca número.
 */
export async function loadOpenCardStatements(profileId: string, until: Date) {
  const rows = await db.cardStatement.findMany({
    where: { profileId, status: 'open', dueDate: { lte: until } },
    orderBy: { dueDate: 'asc' },
    select: {
      id: true,
      dueDate: true,
      totalCents: true,
      isEstimated: true,
      status: true,
      creditCard: { select: { name: true } },
      payments: { select: { amountCents: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    description: `Fatura ${row.creditCard.name}`,
    dueDate: row.dueDate,
    totalCents: row.totalCents,
    paidCents: row.payments.reduce((total, payment) => total + payment.amountCents, 0n),
    status: row.status,
    isEstimated: row.isEstimated,
  }));
}

/**
 * Tudo que já tem dono até o limite: compromissos abertos e faturas em aberto,
 * sem contar duas vezes a mesma conta.
 *
 * Um compromisso ligado a um cartão deixa de pesar quando o mesmo cartão tem
 * fatura não cancelada vencendo no mesmo mês (`withoutBillsCoveredByStatements`,
 * docs/PRODUCT.md, V). As faturas que cobrem podem estar pagas e vencer depois
 * do limite, por isso a consulta delas é separada da de faturas em aberto.
 * O veredito, o detalhe do Saldo Livre de Risco e o modo sobrevivência leem
 * esta mesma função, para o número ser o mesmo nas três telas.
 */
export async function loadCommittedObligations(profileId: string, until: Date) {
  const [scheduled, statements] = await Promise.all([
    loadOpenObligations(profileId, until),
    loadOpenCardStatements(profileId, until),
  ]);
  const linked = scheduled.filter((obligation) => obligation.creditCardId);
  const earliest = linked.reduce<Date | null>((first, obligation) => (!first || obligation.dueDate < first ? obligation.dueDate : first), null);
  const coverage = earliest
    ? await db.cardStatement.findMany({
        where: {
          profileId,
          status: { not: 'cancelled' },
          creditCardId: { in: [...new Set(linked.map((obligation) => obligation.creditCardId as string))] },
          dueDate: { gte: new Date(earliest.getFullYear(), earliest.getMonth(), 1), lt: new Date(until.getFullYear(), until.getMonth() + 1, 1) },
        },
        select: { creditCardId: true, dueDate: true, status: true },
      })
    : [];

  const cardObligations = statements.flatMap((statement) =>
    cardStatementObligations([statement]).map((obligation) => ({
      id: statement.id,
      description: statement.description,
      ...obligation,
    })),
  );
  return [...withoutBillsCoveredByStatements(scheduled, coverage), ...cardObligations].sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
}

/**
 * Intervalos cobertos por extrato importado.
 *
 * É o que distingue "mês sem movimento" de "mês sem extrato". Lotes sem período
 * registrado são ignorados: eles vêm de antes da migration que passou a gravar
 * a cobertura, e tratá-los como cobertura total afirmaria algo que o sistema
 * não sabe (docs/PRODUCT.md, L-2).
 */
export async function loadCoverage(profileId: string) {
  const batches = await db.importBatch.findMany({
    where: { profileId, status: 'completed', periodStart: { not: null }, periodEnd: { not: null } },
    select: { periodStart: true, periodEnd: true },
  });

  return batches
    .filter((batch): batch is { periodStart: Date; periodEnd: Date } =>
      batch.periodStart !== null && batch.periodEnd !== null)
    .map((batch) => ({ start: batch.periodStart, end: batch.periodEnd }));
}

/**
 * O que os alertas locais precisam (src/server/alerts.ts).
 *
 * Obrigações abertas que vencem antes de `horizon`, inclusive as já vencidas, e
 * a data do dado mais recente de cada conta ativa: saldo informado, fim do
 * extrato importado e último lançamento. Nenhuma descrição de lançamento sai
 * daqui; a descrição é a da obrigação, que a pessoa mesma cadastrou e que a
 * projeção do Saldo Livre de Risco já mostra.
 */
export async function loadAlertInputs(profileId: string, horizon: Date) {
  const [obligations, accounts] = await Promise.all([
    db.scheduledObligation.findMany({
      where: { profileId, status: 'open', dueDate: { lt: horizon } },
      orderBy: { dueDate: 'asc' },
      select: { id: true, description: true, amountCents: true, dueDate: true, isEstimated: true },
    }),
    db.account.findMany({
      where: { profileId, isActive: true },
      select: {
        id: true,
        name: true,
        balanceSnapshots: { orderBy: { capturedAt: 'desc' }, take: 1, select: { capturedAt: true } },
        importBatches: { where: { profileId, periodEnd: { not: null } }, orderBy: { periodEnd: 'desc' }, take: 1, select: { periodEnd: true } },
        transactions: { where: { profileId }, orderBy: { occurredOn: 'desc' }, take: 1, select: { occurredOn: true } },
      },
    }),
  ]);
  return {
    obligations,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      lastBalanceAt: account.balanceSnapshots[0]?.capturedAt ?? null,
      lastStatementAt: account.importBatches[0]?.periodEnd ?? null,
      lastEntryAt: account.transactions[0]?.occurredOn ?? null,
    })),
  };
}

export { transactionSelect };
