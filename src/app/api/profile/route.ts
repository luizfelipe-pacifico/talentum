import { z } from 'zod';
import { db } from '@/server/db';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';

/* Perfil local.

   O aplicativo é de perfil único por banco, mas o perfil precisa existir antes
   de qualquer dado financeiro: ele é o escopo de toda consulta
   (docs/ESTRUTURA_DE_DADOS.md, §4). Esta rota é o passo mínimo do onboarding
   que a Feature 1 de docs/ROUTING_MVP.md formaliza. */

const createSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
});

export async function GET(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;

  const profileId = await getLocalProfileId();
  if (!profileId) return ok({ hasProfile: false });

  const profile = await db.localProfile.findUnique({
    where: { id: profileId },
    select: { id: true, displayName: true, createdAt: true },
  });
  if (!profile) return ok({ hasProfile: false });

  const [accountCount, institutionCount] = await Promise.all([
    db.account.count({ where: { profileId } }),
    db.institution.count({ where: { profileId } }),
  ]);

  return ok({
    hasProfile: true,
    profile: {
      id: profile.id,
      displayName: profile.displayName,
      createdAt: profile.createdAt.toISOString(),
      accountCount,
      institutionCount,
    },
  });
}

export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_PROFILE', 'Os dados do perfil são inválidos.', 400);

  // Idempotente: chamar duas vezes não cria dois perfis.
  const existing = await getLocalProfileId();
  if (existing) return ok({ hasProfile: true, profileId: existing, created: false });

  const profile = await db.localProfile.create({
    data: { displayName: parsed.data.displayName ?? null },
    select: { id: true },
  });

  return ok({ hasProfile: true, profileId: profile.id, created: true }, 201);
}
