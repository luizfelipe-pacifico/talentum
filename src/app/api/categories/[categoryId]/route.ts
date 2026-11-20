import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, prismaFailure, readJson } from '@/server/http';

const schema = z.object({ name: z.string().trim().min(1).max(60).optional(), kind: z.enum(['income', 'expense', 'transfer']).optional() }).strict().refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, context: { params: Promise<{ categoryId: string }> }) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request)); if (!parsed.success) return fail('INVALID_CATEGORY', 'A categoria informada é inválida.', 400);
  const { categoryId } = await context.params;
  const category = await db.category.findFirst({ where: { id: categoryId, profileId: guarded.profileId }, select: { id: true } });
  if (!category) return fail('CATEGORY_NOT_FOUND', 'A categoria não foi encontrada.', 404);
  try {
    const updated = await db.category.update({ where: { id: categoryId, profileId: guarded.profileId }, data: parsed.data, select: { id: true, name: true, kind: true } });
    return ok({ category: updated });
  } catch (error) {
    // Renomear para um nome que já existe bate na unicidade (perfil, nome, tipo).
    return prismaFailure(error, {
      conflict: { code: 'CATEGORY_EXISTS', message: 'Já existe uma categoria com esse nome e tipo.' },
      notFound: { code: 'CATEGORY_NOT_FOUND', message: 'A categoria não foi encontrada.' },
    });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ categoryId: string }> }) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const { categoryId } = await context.params;
  const removed = await db.category.deleteMany({ where: { id: categoryId, profileId: guarded.profileId } });
  if (removed.count !== 1) return fail('CATEGORY_NOT_FOUND', 'A categoria não foi encontrada.', 404);
  return ok({ deleted: true });
}
