import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { ONBOARDING_STEPS, onboardingPayload } from '@/server/onboarding';

const answerValue = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const patchSchema = z.object({
  currentStep: z.enum(ONBOARDING_STEPS),
  version: z.number().int().positive(),
  answers: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]{0,63}$/), answerValue).default({}),
}).strict();

export async function PATCH(request: Request, context: { params: Promise<{ onboardingId: string }> }) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_ONBOARDING_STEP', 'Os dados desta etapa são inválidos.', 400);
  const { onboardingId } = await context.params;

  const session = await db.onboardingSession.findFirst({ where: { id: onboardingId, profileId: guarded.profileId, status: 'draft' } });
  if (!session) return fail('ONBOARDING_NOT_FOUND', 'O primeiro acesso não foi encontrado.', 404);
  if (session.version !== parsed.data.version) return fail('ONBOARDING_CHANGED', 'O primeiro acesso foi atualizado em outra janela.', 409);

  // A versão é conferida pela própria escrita: entre duas janelas com a mesma
  // versão, só uma reivindica a etapa; a outra recebe 409 e nada grava.
  const changed = await db.$transaction(async (tx) => {
    const claimed = await tx.onboardingSession.updateMany({
      where: { id: onboardingId, profileId: guarded.profileId, status: 'draft', version: parsed.data.version },
      data: { currentStep: parsed.data.currentStep, version: { increment: 1 } },
    });
    if (claimed.count !== 1) return true;
    for (const [questionKey, value] of Object.entries(parsed.data.answers)) {
      await tx.onboardingAnswer.upsert({
        where: { profileId: guarded.profileId, onboardingSessionId_questionKey: { onboardingSessionId: onboardingId, questionKey } },
        create: { onboardingSessionId: onboardingId, profileId: guarded.profileId, questionKey, valueJson: JSON.stringify(value) },
        update: { valueJson: JSON.stringify(value) },
      });
    }
    if (typeof parsed.data.answers.displayName === 'string') {
      await tx.localProfile.update({
        where: { id: guarded.profileId },
        data: { displayName: parsed.data.answers.displayName || null },
      });
    }
    return false;
  });
  if (changed) return fail('ONBOARDING_CHANGED', 'O primeiro acesso foi atualizado em outra janela.', 409);
  return ok(await onboardingPayload(guarded.profileId));
}
