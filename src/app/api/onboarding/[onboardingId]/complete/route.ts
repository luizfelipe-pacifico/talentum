import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { onboardingPayload } from '@/server/onboarding';

export async function POST(request: Request, context: { params: Promise<{ onboardingId: string }> }) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { onboardingId } = await context.params;
  const session = await db.onboardingSession.findFirst({
    where: { id: onboardingId, profileId: guarded.profileId, status: 'draft' },
    include: { answers: true },
  });
  if (!session) return fail('ONBOARDING_NOT_FOUND', 'O primeiro acesso não foi encontrado.', 404);
  const answers = new Map(session.answers.map((answer) => [answer.questionKey, JSON.parse(answer.valueJson) as unknown]));
  if (answers.get('privacyAccepted') !== true || typeof answers.get('currency') !== 'string' || typeof answers.get('timezone') !== 'string') {
    return fail('ONBOARDING_INCOMPLETE', 'Revise a privacidade, a moeda e o fuso antes de concluir.', 422);
  }

  const completedAt = new Date();
  await db.$transaction([
    db.onboardingSession.update({ where: { id: onboardingId }, data: { status: 'completed', currentStep: 'review', completedAt, version: { increment: 1 } } }),
    db.userPreference.upsert({ where: { profileId_key: { profileId: guarded.profileId, key: 'currency' } }, create: { profileId: guarded.profileId, key: 'currency', value: String(answers.get('currency')) }, update: { value: String(answers.get('currency')) } }),
    db.userPreference.upsert({ where: { profileId_key: { profileId: guarded.profileId, key: 'timezone' } }, create: { profileId: guarded.profileId, key: 'timezone', value: String(answers.get('timezone')) }, update: { value: String(answers.get('timezone')) } }),
  ]);
  return ok(await onboardingPayload(guarded.profileId));
}
