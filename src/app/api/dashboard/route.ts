import { NextResponse } from 'next/server';
import { consumeActionCode } from '@/server/action-codes';
import { db } from '@/server/db';

const path = '/api/dashboard';

function formatBRL(cents: bigint) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(cents) / 100)
    .replace(/\u00a0/g, ' ');
}

export async function GET(request: Request) {
  if (!consumeActionCode(request.headers.get('X-Action-Code'), 'GET', path)) {
    return NextResponse.json({ error: { code: 'INVALID_ACTION_CODE', message: 'A ação não pôde ser validada.' } }, { status: 403 });
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [accounts, transactionCount, monthTransactions, pendingCount, importCount] = await Promise.all([
    db.account.findMany({
      where: { isActive: true },
      select: { balanceSnapshots: { orderBy: { capturedAt: 'desc' }, take: 1, select: { balanceCents: true } } },
    }),
    db.transaction.count(),
    db.transaction.findMany({ where: { occurredOn: { gte: monthStart } }, select: { amountCents: true } }),
    db.transaction.count({ where: { status: 'pending' } }),
    db.importBatch.count({ where: { status: 'completed' } }),
  ]);

  const balanceCents = accounts.reduce((total, account) => total + (account.balanceSnapshots[0]?.balanceCents ?? 0n), 0n);
  const expenseCents = monthTransactions.reduce(
    (total, transaction) => total + (transaction.amountCents < 0n ? -transaction.amountCents : 0n),
    0n,
  );
  const elapsedDays = Math.max(1, new Date().getDate());
  const dailyAverageCents = expenseCents / BigInt(elapsedDays);

  return NextResponse.json(
    {
      hasFinancialData: accounts.length > 0 || transactionCount > 0 || importCount > 0,
      balance: formatBRL(balanceCents),
      monthExpenses: formatBRL(expenseCents),
      dailyAverage: formatBRL(dailyAverageCents),
      accountCount: accounts.length,
      transactionCount,
      pendingCount,
      importCount,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
