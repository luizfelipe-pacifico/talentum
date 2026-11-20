import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { isUniqueViolation, monthKey } from '@/server/planning-queries';

const schema = z
  .object({ fromMonth: monthKey, toMonth: monthKey })
  .strict()
  .refine((value) => value.fromMonth !== value.toMonth);

/**
 * Copia os limites de um mês para outro sem sobrescrever o que já existe no
 * destino. Repetir a cópia não muda nada: idempotente por construção.
 */
export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_BUDGET_COPY', 'Os meses informados são inválidos.', 400);
  const { fromMonth, toMonth } = parsed.data;
  const profileId = guarded.profileId;

  const copy = () => db.$transaction(async (tx) => {
    const [source, existing] = await Promise.all([
      tx.budget.findMany({ where: { profileId, month: fromMonth }, select: { categoryId: true, limitCents: true } }),
      tx.budget.findMany({ where: { profileId, month: toMonth }, select: { categoryId: true } }),
    ]);
    const taken = new Set(existing.map((item) => item.categoryId));
    const missing = source.filter((item) => !taken.has(item.categoryId));
    if (missing.length > 0) {
      await tx.budget.createMany({
        data: missing.map((item) => ({ profileId, categoryId: item.categoryId, month: toMonth, limitCents: item.limitCents })),
      });
    }
    return missing.length;
  });
  try {
    return ok({ copied: await copy() });
  } catch (error) {
    // Cópia simultânea para o mesmo mês: a nova tentativa enxerga o que a
    // outra gravou e copia só o que ainda falta.
    if (!isUniqueViolation(error)) throw error;
    return ok({ copied: await copy() });
  }
}
