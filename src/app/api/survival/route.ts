import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { monthBounds, monthKeyOf, observedThrough, shiftMonth, spendingByCategory } from '@/server/budget-metrics';
import { essentialSplit } from '@/server/debt-metrics';
import { loadCoverage, loadSurvival, loadTransactions, toWire } from '@/server/planning-queries';

/* Modo sobrevivência (Stage 13): foco em liquidez. Mostra o Saldo Livre de
   Risco, as dívidas em atraso e o gasto do mês separado em essencial e não
   essencial, pela marcação que a própria pessoa faz nas categorias.
   Educação financeira, não orientação individual. */

const putSchema = z.object({ essentialCategoryIds: z.array(z.string().uuid()).max(500) }).strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const today = new Date();
  const month = monthKeyOf(today);
  // O mês anterior completo também aparece: no começo do mês o corrente quase não tem dados.
  const previous = shiftMonth(month, -1);
  const [categories, transactions, coverage, survival] = await Promise.all([
    db.category.findMany({ where: { profileId: guarded.profileId, kind: 'expense' }, orderBy: { name: 'asc' }, select: { id: true, name: true, isEssential: true } }),
    loadTransactions(guarded.profileId, monthBounds(previous).start, monthBounds(month).end),
    loadCoverage(guarded.profileId),
    loadSurvival(guarded.profileId, today),
  ]);
  const essentialIds = new Set(categories.filter((category) => category.isEssential).map((category) => category.id));
  const periods = [previous, month].map((key) => {
    const spending = spendingByCategory(transactions, key);
    return {
      month: key,
      observedDays: observedThrough(key, coverage, today),
      ...essentialSplit(spending, essentialIds),
      byCategory: categories
        .map((category) => ({ categoryId: category.id, cents: spending.get(category.id) ?? 0n }))
        .filter((item) => item.cents > 0n),
    };
  });
  return ok({ hasProfile: true, survival: toWire(survival), categories, periods: toWire(periods) });
}

/** Define o conjunto de categorias essenciais. Repetir o pedido dá o mesmo estado. */
export async function PUT(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = putSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_ESSENTIAL_CATEGORIES', 'As categorias informadas são inválidas.', 400);
  const ids = [...new Set(parsed.data.essentialCategoryIds)];
  const owned = await db.category.count({ where: { profileId: guarded.profileId, kind: 'expense', id: { in: ids } } });
  if (owned !== ids.length) return fail('CATEGORY_NOT_FOUND', 'Uma das categorias não foi encontrada.', 404);
  await db.$transaction([
    db.category.updateMany({ where: { profileId: guarded.profileId, kind: 'expense', id: { notIn: ids } }, data: { isEssential: false } }),
    db.category.updateMany({ where: { profileId: guarded.profileId, kind: 'expense', id: { in: ids } }, data: { isEssential: true } }),
  ]);
  return ok({ essentialCount: ids.length });
}
