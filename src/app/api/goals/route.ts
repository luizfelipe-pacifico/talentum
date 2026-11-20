import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { loadGoalPlans } from '@/server/goal-queries';
import { civilDate, planningEvent, positiveCents, shortName, toWire } from '@/server/planning-queries';

/* Metas de economia (Stage 12). O valor guardado nasce das contribuições
   datadas; a viabilidade compara o depósito mensal com a sobra medida. */

const createSchema = z.object({ name: shortName, targetCents: positiveCents, deadline: civilDate.nullable().optional() }).strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { goals, surplus } = await loadGoalPlans(guarded.profileId, new Date());
  return ok({ hasProfile: true, measuredSurplus: toWire(surplus), goals: toWire(goals) });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_GOAL', 'A meta informada é inválida.', 400);

  const goal = await db.$transaction(async (tx) => {
    const created = await tx.goal.create({
      data: { profileId: guarded.profileId, name: parsed.data.name, targetCents: parsed.data.targetCents, deadline: parsed.data.deadline ?? null },
      select: { id: true },
    });
    await tx.timelineEvent.create({ data: planningEvent(guarded.profileId, 'Meta criada', 'Uma meta de economia foi cadastrada.') });
    return created;
  });
  return ok({ goalId: goal.id }, 201);
}
