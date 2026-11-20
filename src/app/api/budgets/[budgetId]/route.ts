import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';

/** Remove o limite. O gasto da categoria continua aparecendo, sem limite. */
export async function DELETE(request: Request, context: { params: Promise<{ budgetId: string }> }) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { budgetId } = await context.params;
  const removed = await db.budget.deleteMany({ where: { id: budgetId, profileId: guarded.profileId } });
  if (removed.count !== 1) return fail('BUDGET_NOT_FOUND', 'O limite não foi encontrado.', 404);
  return ok({ deleted: true });
}
