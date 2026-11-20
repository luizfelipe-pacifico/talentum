import { z } from 'zod';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { simulateContribution } from '@/server/arca-metrics';
import { loadSurvival, positiveCents, toWire } from '@/server/planning-queries';
import { loadNetWorth } from '@/server/portfolio-queries';

/* Simulação do próximo aporte (docs/ARCHITECTURE.md, 2.7):
   1. confere o modo sobrevivência;
   2. soma o total elegível (os quatro pilares);
   3. identifica os pilares abaixo da banda;
   4. simula a distribuição do dinheiro novo, sem venda;
   5. devolve os números para a tela explicar o cálculo.
   Não grava nada e não é orientação financeira individual. */

const schema = z.object({ amountCents: positiveCents }).strict();

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_CONTRIBUTION_AMOUNT', 'Informe um valor de aporte maior que zero.', 400);

  const [{ summary }, survival] = await Promise.all([loadNetWorth(guarded.profileId), loadSurvival(guarded.profileId, new Date())]);
  if (survival.active) {
    return ok({ hasProfile: true, status: 'survival', survival: toWire(survival), steps: [] });
  }
  const steps = simulateContribution(summary.pillars, parsed.data.amountCents);
  return ok({
    hasProfile: true,
    status: 'ok',
    amountCents: parsed.data.amountCents.toString(),
    totalBeforeCents: summary.pillarTotalCents.toString(),
    totalAfterCents: (summary.pillarTotalCents + parsed.data.amountCents).toString(),
    survival: toWire(survival),
    steps: toWire(steps),
  });
}
