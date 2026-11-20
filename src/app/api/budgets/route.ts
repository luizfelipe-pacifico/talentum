import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { budgetSummary, monthBounds, monthKeyOf, shiftMonth } from '@/server/budget-metrics';
import { isUniqueViolation, loadCoverage, loadTransactions, monthKey, nonNegativeCents, toWire } from '@/server/planning-queries';

/* Orçamento mensal (Stage 9): limite por categoria de despesa, realizado a
   partir de lançamentos confirmados, projeção, média de três meses e sobra.
   Nenhuma recomendação personalizada: a rota só compara números. */

const upsertSchema = z.object({ month: monthKey, categoryId: z.string().uuid(), limitCents: nonNegativeCents }).strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const today = new Date();
  const requested = new URL(request.url).searchParams.get('month') ?? monthKeyOf(today);
  const parsed = monthKey.safeParse(requested);
  if (!parsed.success) return fail('INVALID_BUDGET_MONTH', 'O mês informado é inválido.', 400);
  const month = parsed.data;

  // Três meses antes para a média móvel, até o fim do mês pedido.
  const window = { start: monthBounds(shiftMonth(month, -3)).start, end: monthBounds(month).end };
  const [categories, budgets, transactions, coverage, previousLimits] = await Promise.all([
    db.category.findMany({ where: { profileId: guarded.profileId, kind: 'expense' }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.budget.findMany({ where: { profileId: guarded.profileId, month }, select: { id: true, categoryId: true, limitCents: true } }),
    loadTransactions(guarded.profileId, window.start, window.end),
    loadCoverage(guarded.profileId),
    db.budget.count({ where: { profileId: guarded.profileId, month: shiftMonth(month, -1) } }),
  ]);

  const summary = budgetSummary({
    month,
    today,
    categories,
    limits: new Map(budgets.map((budget) => [budget.categoryId, budget.limitCents])),
    transactions,
    coverage,
  });
  const budgetIds = new Map(budgets.map((budget) => [budget.categoryId, budget.id]));

  return ok({
    hasProfile: true,
    ...(toWire(summary) as Record<string, unknown>),
    lines: summary.lines.map((line) => ({
      ...(toWire(line) as Record<string, unknown>),
      budgetId: line.categoryId ? (budgetIds.get(line.categoryId) ?? null) : null,
    })),
    previousMonthLimits: previousLimits,
  });
}

/** Grava o limite do mês. Repetir o mesmo pedido atualiza o mesmo registro. */
export async function PUT(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = upsertSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_BUDGET', 'O limite informado é inválido.', 400);
  const { month, categoryId, limitCents } = parsed.data;

  const category = await db.category.findFirst({ where: { id: categoryId, profileId: guarded.profileId, kind: 'expense' }, select: { id: true } });
  if (!category) return fail('CATEGORY_NOT_FOUND', 'A categoria de despesa não foi encontrada.', 404);

  const write = () =>
    db.budget.upsert({
      where: { profileId_categoryId_month: { profileId: guarded.profileId, categoryId, month } },
      create: { profileId: guarded.profileId, categoryId, month, limitCents },
      update: { limitCents },
      select: { id: true },
    });
  try {
    return ok({ budgetId: (await write()).id });
  } catch (error) {
    // Dois pedidos simultâneos podem tentar criar o mesmo limite; o segundo
    // vira atualização na nova tentativa.
    if (!isUniqueViolation(error)) throw error;
    return ok({ budgetId: (await write()).id });
  }
}
