import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { refreshStatementStatus } from '@/server/card-store';

/* Desfazer a conciliação de um pagamento de fatura.

   Remove só a ligação; o lançamento da conta continua intacto. A situação da
   fatura é recalculada na mesma transação. */

type Context = { params: Promise<{ statementId: string; paymentId: string }> };

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { statementId, paymentId } = await context.params;
  const status = await db.$transaction(async (tx) => {
    const removed = await tx.cardStatementPayment.deleteMany({
      where: { id: paymentId, cardStatementId: statementId, profileId: guarded.profileId },
    });
    if (removed.count === 0) return null;
    return refreshStatementStatus(tx, statementId);
  });
  if (!status) return fail('PAYMENT_NOT_FOUND', 'O pagamento informado não existe.', 404);
  return ok({ deleted: true, status });
}
