import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

const cents = z.string().regex(/^\d+$/).transform(BigInt).refine((value) => value > 0n);
const schema = z.object({
  description: z.string().trim().min(1).max(100), amountCents: cents,
  frequency: z.enum(['once', 'weekly', 'biweekly', 'monthly', 'variable']),
  accountId: z.string().uuid().nullable().optional(), nextExpectedDate: z.string().datetime().nullable().optional(),
}).strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const incomes = await db.incomeSource.findMany({ where: { profileId: guarded.profileId, isActive: true }, orderBy: [{ nextExpectedDate: 'asc' }, { description: 'asc' }], select: { id: true, description: true, amountCents: true, frequency: true, accountId: true, nextExpectedDate: true } });
  return ok({ hasProfile: true, incomes: incomes.map((item) => ({ ...item, amountCents: item.amountCents.toString(), nextExpectedDate: item.nextExpectedDate?.toISOString() ?? null })) });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request)); if (!parsed.success) return fail('INVALID_INCOME', 'A fonte de renda informada é inválida.', 400);
  if (parsed.data.accountId) {
    const account = await db.account.findFirst({ where: { id: parsed.data.accountId, profileId: guarded.profileId }, select: { id: true } });
    if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não foi encontrada.', 404);
  }
  const income = await db.incomeSource.create({ data: { profileId: guarded.profileId, ...parsed.data, nextExpectedDate: parsed.data.nextExpectedDate ? new Date(parsed.data.nextExpectedDate) : null }, select: { id: true } });
  return ok({ incomeId: income.id }, 201);
}
