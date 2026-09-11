import { NextResponse } from 'next/server';
import { consumeActionCode } from '@/server/action-codes';
import { db } from '@/server/db';
import { getLocalProfileId } from '@/server/profile';
import {
  committedCents,
  consolidatedBalance,
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
   pertence à renderização (docs/DASHBOARD.md, R-25). */
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
  if (!consumeActionCode(request.headers.get('X-Action-Code'), 'GET', path)) return denied();

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

  const [accounts, currentRows, previousRows, obligations, pendingCount, importCount] = await Promise.all([
    db.account.findMany({
      where: { profileId, isActive: true },
      select: {
        id: true,
        balanceSnapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
          select: { balanceCents: true, capturedAt: true },
        },
      },
    }),
    db.transaction.findMany({
      where: { profileId, occurredOn: { gte: current.start, lte: current.end } },
      select: transactionSelect,
    }),
    db.transaction.findMany({
      where: { profileId, occurredOn: { gte: previous.start, lte: previous.end } },
      select: transactionSelect,
    }),
    db.scheduledObligation.findMany({
      where: { profileId, status: 'open', dueDate: { lte: periodEnd } },
      select: { amountCents: true, dueDate: true, status: true },
    }),
    db.transaction.count({ where: { profileId, status: 'pending' } }),
    db.importBatch.count({ where: { profileId, status: 'completed' } }),
  ]);

  // O saldo precisa dos lançamentos posteriores ao snapshot, que podem ser
  // anteriores ao período exibido; por isso a consulta é própria.
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
    settlementRows.map(toInput),
  );

  const currentExpenses = expensesCents(currentRows.map(toInput));
  const previousExpenses = expensesCents(previousRows.map(toInput));
  const committed = committedCents(obligations, periodEnd);

  return NextResponse.json(
    {
      hasProfile: true,
      period: { start: current.start.toISOString(), end: periodEnd.toISOString(), elapsedDays: current.elapsedDays },
      riskFreeBalanceCents: cents(riskFreeBalanceCents(balance.cents, committed)),
      balanceCents: cents(balance.cents),
      committedCents: cents(committed),
      committedCount: obligations.length,
      monthExpensesCents: cents(currentExpenses),
      monthExpensesChange: percentChange(currentExpenses, previousExpenses),
      dailyAverageCents: cents(dailyAverageCents(currentExpenses, current.elapsedDays)),
      dailyAverageChange: percentChange(
        dailyAverageCents(currentExpenses, current.elapsedDays),
        dailyAverageCents(previousExpenses, previous.elapsedDays),
      ),
      accountsWithKnownBalance: balance.knownAccounts,
      accountsWithUnknownBalance: balance.unknownAccounts,
      pendingCount,
      importCount,
    },
    { headers },
  );
}
