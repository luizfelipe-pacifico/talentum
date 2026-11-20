import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { payoffPlan } from '@/server/debt-metrics';
import { positiveCents, toWire } from '@/server/planning-queries';

/* Simulação do plano de quitação. Não grava nada: é uma conta educativa com
   juros compostos mensais, sem multa, IOF ou renegociação. */

const schema = z.object({ strategy: z.enum(['avalanche', 'snowball']), monthlyBudgetCents: positiveCents }).strict();

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_PAYOFF_PLAN', 'O valor mensal ou o método informado é inválido.', 400);

  const debts = await db.debt.findMany({
    where: { profileId: guarded.profileId, status: 'open' },
    select: { id: true, name: true, principalCents: true, monthlyRateBps: true, minimumPaymentCents: true, overdueCents: true },
  });
  // Até 30 anos: além disso a simulação deixa de ser informativa.
  const plan = payoffPlan(debts, parsed.data.monthlyBudgetCents, parsed.data.strategy, 360);
  return ok({ hasProfile: true, plan: toWire(plan) });
}
