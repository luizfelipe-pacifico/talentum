import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

const schema = z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(['income', 'expense', 'transfer']) }).strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const categories = await db.category.findMany({ where: { profileId: guarded.profileId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }], select: { id: true, name: true, kind: true } });
  return ok({ hasProfile: true, categories });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_CATEGORY', 'A categoria informada é inválida.', 400);
  const duplicate = await db.category.findFirst({ where: { profileId: guarded.profileId, name: parsed.data.name, kind: parsed.data.kind }, select: { id: true } });
  if (duplicate) return fail('CATEGORY_EXISTS', 'Essa categoria já existe.', 409);
  const category = await db.category.create({ data: { profileId: guarded.profileId, ...parsed.data }, select: { id: true, name: true, kind: true } });
  return ok({ category }, 201);
}
