import { NextResponse } from 'next/server';
import { consumeActionCode } from '@/server/action-codes';
import { db } from '@/server/db';
import { getLocalProfileId } from '@/server/profile';
import {
  categoryBreakdown,
  monthToDate,
  type CategoryKind,
  type TransactionInput,
} from '@/server/dashboard-metrics';

const path = '/api/dashboard/categories';

export async function GET(request: Request) {
  if (!consumeActionCode(request.headers.get('X-Action-Code'), 'GET', path)) {
    return NextResponse.json(
      { error: { code: 'INVALID_ACTION_CODE', message: 'A ação não pôde ser validada.' } },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const profileId = await getLocalProfileId();
  const headers = { 'Cache-Control': 'no-store' };
  if (!profileId) return NextResponse.json({ hasProfile: false }, { headers });

  const period = monthToDate(new Date());

  const [rows, categories] = await Promise.all([
    db.transaction.findMany({
      where: { profileId, occurredOn: { gte: period.start, lte: period.end } },
      select: {
        accountId: true,
        occurredOn: true,
        amountCents: true,
        status: true,
        categoryId: true,
        category: { select: { kind: true } },
      },
    }),
    db.category.findMany({ where: { profileId }, select: { id: true, name: true } }),
  ]);

  const transactions: TransactionInput[] = rows.map((row) => ({
    accountId: row.accountId,
    occurredOn: row.occurredOn,
    amountCents: row.amountCents,
    status: row.status,
    categoryId: row.categoryId,
    categoryKind: (row.category?.kind as CategoryKind | undefined) ?? null,
  }));

  const { slices, totalCents } = categoryBreakdown(
    transactions,
    new Map(categories.map((category) => [category.id, category.name])),
  );

  return NextResponse.json(
    {
      hasProfile: true,
      period: { start: period.start.toISOString(), end: period.end.toISOString() },
      totalCents: totalCents.toString(),
      // A soma das fatias é sempre igual ao total: "Sem categoria" é uma fatia,
      // não um descarte (docs/DASHBOARD.md, G-2).
      slices: slices.map((slice) => ({ name: slice.name, cents: slice.cents.toString() })),
    },
    { headers },
  );
}
