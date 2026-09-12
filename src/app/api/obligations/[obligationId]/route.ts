import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

const patchSchema = z.object({ status: z.enum(['open', 'paid', 'cancelled']).optional(), description: z.string().trim().min(1).max(100).optional() }).strict().refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: { params: Promise<{ obligationId: string }> }) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const parsed = patchSchema.safeParse(await readJson(request)); if (!parsed.success) return fail('INVALID_OBLIGATION', 'O compromisso informado é inválido.', 400);
  const { obligationId } = await context.params;
  const owned = await db.scheduledObligation.findFirst({ where: { id: obligationId, profileId: guarded.profileId }, select: { id: true } });
  if (!owned) return fail('OBLIGATION_NOT_FOUND', 'O compromisso não foi encontrado.', 404);
  await db.scheduledObligation.update({ where: { id: obligationId }, data: parsed.data });
  return ok({ updated: true });
}

export async function DELETE(request: Request, context: { params: Promise<{ obligationId: string }> }) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const { obligationId } = await context.params;
  const removed = await db.scheduledObligation.deleteMany({ where: { id: obligationId, profileId: guarded.profileId } });
  if (removed.count !== 1) return fail('OBLIGATION_NOT_FOUND', 'O compromisso não foi encontrado.', 404);
  return ok({ deleted: true });
}
