import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { loadGoalPlans } from '@/server/goal-queries';
import { civilDate, planningEvent, positiveCents, shortName, toWire } from '@/server/planning-queries';

const patchSchema = z
  .object({
    name: shortName.optional(),
    targetCents: positiveCents.optional(),
    deadline: civilDate.nullable().optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

type Context = { params: Promise<{ goalId: string }> };

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { goalId } = await context.params;
  const { goals, surplus } = await loadGoalPlans(guarded.profileId, new Date(), goalId);
  const goal = goals[0];
  if (!goal) return fail('GOAL_NOT_FOUND', 'A meta não foi encontrada.', 404);
  const contributions = await db.goalContribution.findMany({
    where: { profileId: guarded.profileId, goalId },
    orderBy: [{ contributedOn: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    select: { id: true, kind: true, amountCents: true, contributedOn: true },
  });
  return ok({ hasProfile: true, measuredSurplus: toWire(surplus), goal: toWire(goal), contributions: toWire(contributions) });
}

export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_GOAL', 'A meta informada é inválida.', 400);
  const { goalId } = await context.params;
  const updated = await db.goal.updateMany({ where: { id: goalId, profileId: guarded.profileId }, data: parsed.data });
  if (updated.count !== 1) return fail('GOAL_NOT_FOUND', 'A meta não foi encontrada.', 404);
  return ok({ updated: true });
}

/** Exclui a meta e as contribuições dela. O dinheiro em si não muda de lugar. */
export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { goalId } = await context.params;
  const removed = await db.$transaction(async (tx) => {
    const result = await tx.goal.deleteMany({ where: { id: goalId, profileId: guarded.profileId } });
    if (result.count === 1) await tx.timelineEvent.create({ data: planningEvent(guarded.profileId, 'Meta excluída', 'Uma meta e as contribuições registradas nela foram excluídas.') });
    return result.count;
  });
  if (removed !== 1) return fail('GOAL_NOT_FOUND', 'A meta não foi encontrada.', 404);
  return ok({ deleted: true });
}
