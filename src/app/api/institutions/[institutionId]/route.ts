import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

/* Uma instituição.

   Feature 2 de docs/ROUTING_MVP.md. Toda operação é escopada por perfil: um ID
   opaco não é autorização (docs/ESTRUTURA_DE_DADOS.md, §4). */

type Context = { params: Promise<{ institutionId: string }> };

const patchSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { institutionId } = await context.params;
  const institution = await db.institution.findFirst({
    where: { id: institutionId, profileId: guarded.profileId },
    select: {
      id: true,
      name: true,
      accounts: { select: { id: true, name: true, type: true, isActive: true }, orderBy: { name: 'asc' } },
    },
  });
  if (!institution) return fail('INSTITUTION_NOT_FOUND', 'A instituição informada não existe.', 404);

  return ok({ hasProfile: true, institution });
}

export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { institutionId } = await context.params;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_INSTITUTION', 'O nome da instituição é inválido.', 400);

  const existing = await db.institution.findFirst({
    where: { id: institutionId, profileId: guarded.profileId },
    select: { id: true },
  });
  if (!existing) return fail('INSTITUTION_NOT_FOUND', 'A instituição informada não existe.', 404);

  // Renomear para um nome já usado juntaria duas instituições distintas na
  // cabeça de quem lê a lista.
  const clash = await db.institution.findFirst({
    where: { profileId: guarded.profileId, name: parsed.data.name, NOT: { id: existing.id } },
    select: { id: true },
  });
  if (clash) return fail('INSTITUTION_NAME_TAKEN', 'Já existe uma instituição com esse nome.', 409);

  const institution = await db.institution.update({
    where: { id: existing.id },
    data: { name: parsed.data.name },
    select: { id: true, name: true },
  });

  return ok({ institution });
}

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { institutionId } = await context.params;
  const institution = await db.institution.findFirst({
    where: { id: institutionId, profileId: guarded.profileId },
    select: { id: true, _count: { select: { accounts: true } } },
  });
  if (!institution) return fail('INSTITUTION_NOT_FOUND', 'A instituição informada não existe.', 404);

  /* A chave estrangeira é `SET NULL`: apagar uma instituição com contas as
     deixaria órfãs em silêncio, sem que ninguém percebesse. Recusar é a
     resposta honesta — a pessoa decide o que fazer com as contas primeiro. */
  if (institution._count.accounts > 0) {
    return fail(
      'INSTITUTION_HAS_ACCOUNTS',
      'Esta instituição ainda tem contas. Mova ou remova as contas antes de excluí-la.',
      409,
    );
  }

  await db.institution.delete({ where: { id: institution.id } });
  return ok({ removed: true });
}
