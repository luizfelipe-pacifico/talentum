import { z } from 'zod';
import { MonthReviewError, reviewMonth } from '@/server/gamification/service';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

/* Marca um mês como revisado. Idempotente pela unicidade (perfil, mês):
   repetir responde 200 com o mesmo registro, sem XP em dobro. Só o mês atual e
   o anterior, e só mês com lançamentos, podem ser revisados. */

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).strict();

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_MONTH_REVIEW', 'O mês informado é inválido.', 400);
  try {
    const result = await reviewMonth(guarded.profileId, parsed.data.month);
    return ok({ hasProfile: true, ...result }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof MonthReviewError)
      return fail('MONTH_NOT_REVIEWABLE', 'Só o mês atual e o anterior, com lançamentos, podem ser marcados como revisados.', 409);
    throw error;
  }
}
