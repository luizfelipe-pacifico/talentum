import { z } from 'zod';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { allocateSurplus } from '@/server/goal-metrics';
import { loadGoalPlans } from '@/server/goal-queries';
import { positiveCents, toWire } from '@/server/planning-queries';

/* Simulação aritmética de como dividir uma sobra entre as metas ativas.
   Não grava nada e não indica produto, instituição ou investimento. */

const schema = z.object({ amountCents: positiveCents, mode: z.enum(['proportional', 'deadline']) }).strict();

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_SURPLUS_ALLOCATION', 'O valor ou o critério informado é inválido.', 400);

  const { goals } = await loadGoalPlans(guarded.profileId, new Date());
  const open = goals.filter((goal) => goal.status === 'active' && goal.plan.remainingCents > 0n);
  const result = allocateSurplus(
    parsed.data.amountCents,
    open.map((goal) => ({ id: goal.id, remainingCents: goal.plan.remainingCents, requiredMonthlyCents: goal.plan.requiredMonthlyCents })),
    parsed.data.mode,
  );
  const names = new Map(open.map((goal) => [goal.id, goal.name]));
  return ok({
    hasProfile: true,
    mode: parsed.data.mode,
    amountCents: parsed.data.amountCents.toString(),
    allocations: result.allocations.map((item) => ({ ...(toWire(item) as Record<string, unknown>), name: names.get(item.goalId) ?? '' })),
    unallocatedCents: result.unallocatedCents.toString(),
  });
}
