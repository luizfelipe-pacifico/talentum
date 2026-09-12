import { z } from 'zod';
import { db } from '@/server/db';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { onboardingPayload } from '@/server/onboarding';
import { getLocalProfileId } from '@/server/profile';

const createSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
}).strict();

export async function GET(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const profileId = await getLocalProfileId();
  if (!profileId) return ok({ hasProfile: false, onboarding: null });
  return ok(await onboardingPayload(profileId));
}

export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_ONBOARDING', 'Não foi possível iniciar o primeiro acesso.', 400);

  let profileId = await getLocalProfileId();
  if (!profileId) {
    const profile = await db.localProfile.create({ data: { displayName: parsed.data.displayName ?? null }, select: { id: true } });
    profileId = profile.id;
  }

  const existing = await db.onboardingSession.findFirst({ where: { profileId, status: 'draft' }, orderBy: { updatedAt: 'desc' } });
  if (!existing) {
    await db.onboardingSession.create({ data: { profileId, status: 'draft', currentStep: 'profile' } });
  }
  return ok(await onboardingPayload(profileId), existing ? 200 : 201);
}
