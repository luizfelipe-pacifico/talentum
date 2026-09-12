import { db } from '@/server/db';

export const ONBOARDING_STEPS = ['profile', 'accounts', 'position', 'review'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export async function onboardingPayload(profileId: string) {
  const session = await db.onboardingSession.findFirst({
    where: { profileId },
    orderBy: { updatedAt: 'desc' },
    include: { answers: { select: { questionKey: true, valueJson: true } } },
  });
  if (!session) return { hasProfile: true as const, onboarding: null };

  const answers = Object.fromEntries(
    session.answers.map((answer) => {
      try { return [answer.questionKey, JSON.parse(answer.valueJson) as unknown]; }
      catch { return [answer.questionKey, null]; }
    }),
  );

  return {
    hasProfile: true as const,
    onboarding: {
      id: session.id,
      status: session.status,
      currentStep: session.currentStep,
      version: session.version,
      completedAt: session.completedAt?.toISOString() ?? null,
      answers,
    },
  };
}
