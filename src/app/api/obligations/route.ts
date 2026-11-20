import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

const obligationSchema = z.object({
  description: z.string().trim().min(1).max(100),
  amountCents: z.string().regex(/^\d+$/).transform(BigInt).refine((value) => value > 0n),
  dueDate: z.string().datetime(), status: z.enum(['open', 'paid', 'cancelled']).default('open'),
  recurrence: z.enum(['none', 'weekly', 'monthly', 'yearly']).default('none'),
  isEstimated: z.boolean().default(false), accountId: z.string().uuid().nullable().optional(), categoryId: z.string().uuid().nullable().optional(),
}).strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const obligations = await db.scheduledObligation.findMany({ where: { profileId: guarded.profileId }, orderBy: [{ dueDate: 'asc' }, { description: 'asc' }], select: { id: true, description: true, amountCents: true, dueDate: true, status: true, recurrence: true, isEstimated: true, accountId: true, categoryId: true } });
  return ok({ hasProfile: true, obligations: obligations.map((item) => ({ ...item, amountCents: item.amountCents.toString(), dueDate: item.dueDate.toISOString() })) });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const parsed = obligationSchema.safeParse(await readJson(request)); if (!parsed.success) return fail('INVALID_OBLIGATION', 'O compromisso informado é inválido.', 400);
  const { accountId, categoryId } = parsed.data;
  const [account, category] = await Promise.all([
    accountId ? db.account.findFirst({ where: { id: accountId, profileId: guarded.profileId }, select: { id: true } }) : null,
    categoryId ? db.category.findFirst({ where: { id: categoryId, profileId: guarded.profileId }, select: { id: true } }) : null,
  ]);
  if (accountId && !account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não foi encontrada.', 404);
  if (categoryId && !category) return fail('CATEGORY_NOT_FOUND', 'A categoria não foi encontrada.', 404);
  const obligation = await db.scheduledObligation.create({ data: { profileId: guarded.profileId, ...parsed.data, dueDate: new Date(parsed.data.dueDate) }, select: { id: true } });
  return ok({ obligationId: obligation.id }, 201);
}
