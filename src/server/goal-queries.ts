/* Leitura de metas com o plano calculado (Stage 12).

   A sobra medida vem dos extratos dos últimos meses completos; sem medição a
   viabilidade é `no_data`, nunca uma suposição. */

import { db } from '@/server/db';
import { measuredMonthlySurplus, monthBounds, monthKeyOf, shiftMonth } from '@/server/budget-metrics';
import { goalPlan, type ContributionInput } from '@/server/goal-metrics';
import { loadCoverage, loadTransactions } from '@/server/planning-queries';

export async function loadMeasuredSurplus(profileId: string, today: Date) {
  const current = monthKeyOf(today);
  const start = monthBounds(shiftMonth(current, -12)).start;
  const end = monthBounds(shiftMonth(current, -1)).end;
  const [transactions, coverage] = await Promise.all([loadTransactions(profileId, start, end), loadCoverage(profileId)]);
  return measuredMonthlySurplus(transactions, coverage, today);
}

const asContribution = (row: { kind: string; amountCents: bigint }): ContributionInput => ({
  kind: row.kind === 'withdrawal' ? 'withdrawal' : 'deposit',
  amountCents: row.amountCents,
});

/** Metas do perfil com o plano de cada uma. `goalId` restringe a uma só. */
export async function loadGoalPlans(profileId: string, today: Date, goalId?: string) {
  const [goals, surplus] = await Promise.all([
    db.goal.findMany({
      where: { profileId, ...(goalId ? { id: goalId } : {}) },
      orderBy: [{ status: 'asc' }, { deadline: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        targetCents: true,
        deadline: true,
        status: true,
        createdAt: true,
        contributions: { select: { kind: true, amountCents: true } },
      },
    }),
    loadMeasuredSurplus(profileId, today),
  ]);

  return {
    surplus,
    goals: goals.map(({ contributions, ...goal }) => ({
      ...goal,
      contributionCount: contributions.length,
      plan: goalPlan({
        targetCents: goal.targetCents,
        deadline: goal.deadline,
        contributions: contributions.map(asContribution),
        today,
        measuredSurplusCents: surplus.averageCents,
      }),
    })),
  };
}
