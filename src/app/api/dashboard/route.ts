import { NextResponse } from 'next/server';
import { consumeActionCode } from '@/server/action-codes';
import { readSessionToken } from '@/server/vault/session';
import { db } from '@/server/db';
import { getLocalProfileId } from '@/server/profile';
import { DUE_SOON_DAYS, localAlerts } from '@/server/alerts';
import { loadAlertInputs, loadCommittedObligations, loadConsolidatedBalance } from '@/server/dashboard-queries';
import {
  committedSummary,
  dailyAverageCents,
  endOfMonth,
  expensesCents,
  monthToDate,
  percentChange,
  previousMonthToDate,
  riskFreeBalanceCents,
  type CategoryKind,
  type TransactionInput,
} from '@/server/dashboard-metrics';

const path = '/api/dashboard';

const denied = () =>
  NextResponse.json(
    { error: { code: 'INVALID_ACTION_CODE', message: 'A ação não pôde ser validada.' } },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );

/* Centavos viajam como string: BigInt não é serializável em JSON e a formatação
   pertence à renderização (docs/PRODUCT.md, R-25). */
const cents = (value: bigint) => value.toString();

type TransactionRow = {
  accountId: string;
  occurredOn: Date;
  amountCents: bigint;
  status: string;
  categoryId: string | null;
  category: { kind: string } | null;
};

const toInput = (row: TransactionRow): TransactionInput => ({
  accountId: row.accountId,
  occurredOn: row.occurredOn,
  amountCents: row.amountCents,
  status: row.status,
  categoryId: row.categoryId,
  categoryKind: (row.category?.kind as CategoryKind | undefined) ?? null,
});

export async function GET(request: Request) {
  if (!consumeActionCode(request.headers.get('X-Action-Code'), 'GET', path, readSessionToken(request))) return denied();

  const profileId = await getLocalProfileId();
  const headers = { 'Cache-Control': 'no-store' };

  // Sem perfil não há base financeira. Responder zero aqui seria afirmar que a
  // pessoa não tem dinheiro antes mesmo de ela ter cadastrado qualquer coisa.
  if (!profileId) {
    return NextResponse.json({ hasProfile: false }, { headers });
  }

  const now = new Date();
  const current = monthToDate(now);
  const previous = previousMonthToDate(now);
  const periodEnd = endOfMonth(now);

  const transactionSelect = {
    accountId: true,
    occurredOn: true,
    amountCents: true,
    status: true,
    categoryId: true,
    category: { select: { kind: true } },
  } as const;

  const alertHorizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DUE_SOON_DAYS + 1);

  const [balance, currentRows, previousRows, obligations, pendingCount, importCount, alertInputs] = await Promise.all([
    // O mesmo saldo da projeção: as duas rotas filtram pela moeda de referência (L-4).
    loadConsolidatedBalance(profileId),
    db.transaction.findMany({
      where: { profileId, occurredOn: { gte: current.start, lte: current.end } },
      select: transactionSelect,
    }),
    db.transaction.findMany({
      where: { profileId, occurredOn: { gte: previous.start, lte: previous.end } },
      select: transactionSelect,
    }),
    // Compromissos e faturas em aberto, sem contar duas vezes a fatura também
    // cadastrada como compromisso (docs/PRODUCT.md, V).
    loadCommittedObligations(profileId, periodEnd),
    db.reconciliationItem.count({ where: { profileId, status: 'pending' } }),
    db.importBatch.count({ where: { profileId, status: 'completed' } }),
    // Alertas de vencimento olham alguns dias além do mês: o dia 2 do mês
    // seguinte vence "em breve" quando hoje é dia 30.
    loadAlertInputs(profileId, alertHorizon),
  ]);

  const alerts = localAlerts({ now, ...alertInputs });

  const currentExpenses = expensesCents(currentRows.map(toInput));
  const previousExpenses = expensesCents(previousRows.map(toInput));
  const committed = committedSummary(obligations, periodEnd);

  return NextResponse.json(
    {
      hasProfile: true,
      period: { start: current.start.toISOString(), end: periodEnd.toISOString(), elapsedDays: current.elapsedDays },
      riskFreeBalanceCents: cents(riskFreeBalanceCents(balance.cents, committed.cents)),
      balanceCents: cents(balance.cents),
      committedCents: cents(committed.cents),
      committedCount: committed.count,
      committedEstimatedCount: committed.estimatedCount,
      balanceReferenceDate: balance.referenceDate?.toISOString() ?? null,
      monthExpensesCents: cents(currentExpenses),
      monthExpensesChange: percentChange(currentExpenses, previousExpenses),
      dailyAverageCents: cents(dailyAverageCents(currentExpenses, current.elapsedDays)),
      dailyAverageChange: percentChange(
        dailyAverageCents(currentExpenses, current.elapsedDays),
        dailyAverageCents(previousExpenses, previous.elapsedDays),
      ),
      accountsWithKnownBalance: balance.knownAccounts,
      accountsWithUnknownBalance: balance.unknownAccounts,
      accountsInOtherCurrency: balance.accountsInOtherCurrency,
      pendingCount,
      importCount,
      alerts: alerts.map((alert) =>
        alert.kind === 'stale_data'
          ? { ...alert, accounts: alert.accounts.map((account) => ({ ...account, lastDataAt: account.lastDataAt.toISOString() })) }
          : {
              ...alert,
              obligations: alert.obligations.map((obligation) => ({
                ...obligation,
                amountCents: cents(obligation.amountCents),
                dueDate: obligation.dueDate.toISOString(),
              })),
            },
      ),
    },
    { headers },
  );
}
