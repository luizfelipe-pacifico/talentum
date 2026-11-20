import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';

/* Remover um item de fatura. Escopado por perfil e pela fatura do caminho. */

type Context = { params: Promise<{ statementId: string; itemId: string }> };

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { statementId, itemId } = await context.params;
  const removed = await db.cardStatementItem.deleteMany({
    where: { id: itemId, cardStatementId: statementId, profileId: guarded.profileId },
  });
  if (removed.count === 0) return fail('STATEMENT_ITEM_NOT_FOUND', 'O item informado não existe.', 404);
  return ok({ deleted: true });
}
