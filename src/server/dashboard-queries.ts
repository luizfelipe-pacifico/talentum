/* Consultas compartilhadas do painel.

   O saldo consolidado alimenta o veredito, a projeção de caixa e o detalhe do
   Saldo Livre de Risco. Ele mora aqui para que as três rotas leiam exatamente o
   mesmo número — duas implementações do mesmo saldo divergiriam em silêncio na
   primeira mudança de regra.

   Toda consulta é escopada por `profileId` (docs/ESTRUTURA_DE_DADOS.md, §4). */

import { db } from '@/server/db';
import {
  consolidatedBalance,
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
 * Saldo consolidado das contas ativas.
 *
 * Último snapshot de cada conta mais os lançamentos posteriores a ele. Conta sem
 * snapshot é contada à parte: desconhecido não é zero (docs/DASHBOARD.md, I-1).
 */
export async function loadConsolidatedBalance(profileId: string): Promise<ConsolidatedBalance> {
  const accounts = await db.account.findMany({
    where: { profileId, isActive: true },
    select: {
      id: true,
      balanceSnapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
        select: { balanceCents: true, capturedAt: true },
      },
    },
  });

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

  return consolidatedBalance(
    accounts.map((account) => ({
      accountId: account.id,
      snapshot: account.balanceSnapshots[0] ?? null,
    })),
    settlementRows.map(toTransactionInput),
  );
}

/** Obrigações abertas com vencimento até o limite informado. */
export async function loadOpenObligations(profileId: string, until: Date) {
  return db.scheduledObligation.findMany({
    where: { profileId, status: 'open', dueDate: { lte: until } },
    orderBy: { dueDate: 'asc' },
    select: { id: true, description: true, amountCents: true, dueDate: true, status: true, isEstimated: true },
  });
}

/**
 * Intervalos cobertos por extrato importado.
 *
 * É o que distingue "mês sem movimento" de "mês sem extrato". Lotes sem período
 * registrado são ignorados: eles vêm de antes da migration que passou a gravar
 * a cobertura, e tratá-los como cobertura total afirmaria algo que o sistema
 * não sabe (docs/DASHBOARD.md, L-2).
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

export { transactionSelect };
