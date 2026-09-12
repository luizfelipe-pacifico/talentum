import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

/* Instituições financeiras do perfil local.

   Feature 2 de docs/ROUTING_MVP.md: a instituição é cadastrada apenas pelo
   nome. Agência, número de conta, senha e credencial bancária não são pedidos
   em nenhum momento (docs/ONBOARDING.md, "Perguntas que não devem existir"). */

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const institutions = await db.institution.findMany({
    where: { profileId: guarded.profileId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, _count: { select: { accounts: true } } },
  });

  return ok({
    hasProfile: true,
    institutions: institutions.map((institution) => ({
      id: institution.id,
      name: institution.name,
      accountCount: institution._count.accounts,
    })),
  });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_INSTITUTION', 'O nome da instituição é inválido.', 400);

  const name = parsed.data.name;

  // Reaproveita a instituição já cadastrada em vez de duplicá-la: o onboarding
  // e a importação chegam aqui pelo mesmo nome.
  const existing = await db.institution.findFirst({
    where: { profileId: guarded.profileId, name },
    select: { id: true, name: true },
  });
  if (existing) return ok({ institution: existing, created: false });

  const institution = await db.institution.create({
    data: { profileId: guarded.profileId, name },
    select: { id: true, name: true },
  });

  return ok({ institution, created: true }, 201);
}
