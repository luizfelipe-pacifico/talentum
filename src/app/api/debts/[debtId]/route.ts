import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { nonNegativeCents, planningEvent, shortName } from '@/server/planning-queries';

const patchSchema = z
  .object({
    name: shortName.optional(),
    principalCents: nonNegativeCents.optional(),
    monthlyRateBps: z.number().int().min(0).max(5_000).optional(),
    minimumPaymentCents: nonNegativeCents.optional(),
    overdueCents: nonNegativeCents.optional(),
    dueDay: z.number().int().min(1).max(31).nullable().optional(),
    status: z.enum(['open', 'paid']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

type Context = { params: Promise<{ debtId: string }> };

export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_DEBT', 'A dívida informada é inválida.', 400);
  const { debtId } = await context.params;
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.debt.updateMany({ where: { id: debtId, profileId: guarded.profileId }, data: parsed.data });
    if (result.count === 1 && parsed.data.status === 'paid') {
      await tx.timelineEvent.create({ data: planningEvent(guarded.profileId, 'Dívida marcada como quitada', 'Uma dívida do planejamento foi marcada como quitada.') });
    }
    return result.count;
  });
  if (updated !== 1) return fail('DEBT_NOT_FOUND', 'A dívida não foi encontrada.', 404);
  return ok({ updated: true });
}

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { debtId } = await context.params;
  const removed = await db.debt.deleteMany({ where: { id: debtId, profileId: guarded.profileId } });
  if (removed.count !== 1) return fail('DEBT_NOT_FOUND', 'A dívida não foi encontrada.', 404);
  return ok({ deleted: true });
}
