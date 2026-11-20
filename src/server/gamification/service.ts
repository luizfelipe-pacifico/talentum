/* Gamificação ligada ao banco local: lê os fatos e entrega ao núcleo puro. */

import { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import { canReviewMonth, summarizeGamification, type GamificationInput } from '@/server/gamification/rules';

async function monthsWithTransactions(profileId: string): Promise<string[]> {
  // Só os dois meses que podem ser revisados interessam; a consulta fica pequena.
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rows = await db.transaction.findMany({ where: { profileId, occurredOn: { gte: since } }, select: { occurredOn: true } });
  const months = new Set<string>();
  for (const row of rows) months.add(`${row.occurredOn.getFullYear()}-${String(row.occurredOn.getMonth() + 1).padStart(2, '0')}`);
  return [...months];
}

async function loadInput(profileId: string, now: Date): Promise<GamificationInput> {
  const [accounts, imports, decisions, pending, reviews, restorePoints, months] = await Promise.all([
    db.account.findMany({ where: { profileId, isActive: true }, select: { id: true, name: true } }),
    db.importBatch.findMany({ where: { profileId }, select: { accountId: true, importedAt: true, account: { select: { name: true } } } }),
    db.reconciliationDecision.findMany({ where: { profileId, revertedAt: null }, select: { createdAt: true } }),
    db.reconciliationItem.count({ where: { profileId, status: 'pending' } }),
    db.monthlyReview.findMany({ where: { profileId }, select: { month: true, createdAt: true } }),
    db.databaseBackup.findMany({ where: { profileId, kind: 'manual' }, select: { createdAt: true } }),
    monthsWithTransactions(profileId),
  ]);
  return {
    now,
    activeAccounts: accounts,
    imports: imports.map((batch) => ({ accountId: batch.accountId, accountName: batch.account?.name ?? null, importedAt: batch.importedAt })),
    decisions,
    pendingReconciliation: pending,
    monthlyReviews: reviews,
    manualRestorePoints: restorePoints,
    monthsWithTransactions: months,
  };
}

export async function gamificationSummary(profileId: string, now = new Date()) {
  return summarizeGamification(await loadInput(profileId, now));
}

export class MonthReviewError extends Error {}

/** Marca o mês como revisado. Idempotente: o mesmo mês uma vez só. */
export async function reviewMonth(profileId: string, month: string, now = new Date()) {
  if (!canReviewMonth(month, now, await monthsWithTransactions(profileId))) throw new MonthReviewError('MONTH_NOT_REVIEWABLE');
  const existing = await db.monthlyReview.findFirst({ where: { profileId, month }, select: { id: true } });
  if (existing) return { reviewId: existing.id, created: false };
  try {
    const review = await db.$transaction(async (tx) => {
      const created = await tx.monthlyReview.create({ data: { profileId, month }, select: { id: true } });
      await tx.timelineEvent.create({
        data: { profileId, kind: 'month_review', title: 'Mês revisado', description: 'O mês foi marcado como revisado no perfil.', reversible: false },
      });
      return created;
    });
    return { reviewId: review.id, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await db.monthlyReview.findFirst({ where: { profileId, month }, select: { id: true } });
      if (raced) return { reviewId: raced.id, created: false };
    }
    throw error;
  }
}
