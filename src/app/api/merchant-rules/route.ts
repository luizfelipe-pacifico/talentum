import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

const schema = z.object({
  categoryId: z.string().uuid(), pattern: z.string().trim().min(2).max(120),
  matchType: z.enum(['contains', 'startsWith', 'exact']).default('contains'),
  priority: z.number().int().min(-100).max(100).default(0),
}).strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const rules = await db.merchantRule.findMany({ where: { profileId: guarded.profileId, isActive: true }, orderBy: [{ priority: 'desc' }, { pattern: 'asc' }], select: { id: true, categoryId: true, pattern: true, matchType: true, priority: true } });
  return ok({ hasProfile: true, rules });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request)); if (!parsed.success) return fail('INVALID_MERCHANT_RULE', 'A regra informada é inválida.', 400);
  const category = await db.category.findFirst({ where: { id: parsed.data.categoryId, profileId: guarded.profileId }, select: { id: true } });
  if (!category) return fail('CATEGORY_NOT_FOUND', 'A categoria não foi encontrada.', 404);
  const duplicate = await db.merchantRule.findFirst({ where: { profileId: guarded.profileId, pattern: parsed.data.pattern, matchType: parsed.data.matchType }, select: { id: true } });
  if (duplicate) return fail('MERCHANT_RULE_EXISTS', 'Essa regra já existe.', 409);
  const rule = await db.merchantRule.create({ data: { profileId: guarded.profileId, ...parsed.data }, select: { id: true } });
  return ok({ ruleId: rule.id }, 201);
}
