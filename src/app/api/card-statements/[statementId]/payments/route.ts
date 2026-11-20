import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { outstandingCents } from '@/server/cards';
import { findStatement, isUniqueViolation, paymentCreateSchema, refreshStatementStatus } from '@/server/card-store';

/* Conciliar o pagamento da fatura com um lançamento da conta.

   A pessoa escolhe o lançamento entre os candidatos; o backend revalida tudo:
   o lançamento é do perfil, é uma saída, não paga outra fatura e não passa do
   que falta pagar. A ligação e a nova situação da fatura são gravadas na mesma
   transação. Repetir a mesma ligação devolve a existente (idempotente). */

type Context = { params: Promise<{ statementId: string }> };

export async function POST(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { statementId } = await context.params;
  const parsed = paymentCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_PAYMENT', 'O pagamento informado é inválido.', 400);

  const statement = await findStatement(guarded.profileId, statementId);
  if (!statement) return fail('STATEMENT_NOT_FOUND', 'A fatura informada não existe.', 404);
  if (statement.status === 'cancelled') {
    return fail('STATEMENT_CANCELLED', 'A fatura está cancelada e não recebe pagamento.', 409);
  }

  const transaction = await db.transaction.findFirst({
    where: { id: parsed.data.transactionId, profileId: guarded.profileId },
    select: {
      id: true,
      amountCents: true,
      cardStatementPayment: { select: { id: true, cardStatementId: true } },
    },
  });
  if (!transaction) return fail('TRANSACTION_NOT_FOUND', 'O lançamento informado não existe.', 404);
  if (transaction.cardStatementPayment) {
    if (transaction.cardStatementPayment.cardStatementId === statement.id) {
      return ok({ payment: { id: transaction.cardStatementPayment.id }, replayed: true });
    }
    return fail('TRANSACTION_ALREADY_LINKED', 'Este lançamento já paga outra fatura.', 409);
  }
  if (transaction.amountCents >= 0n) {
    return fail('PAYMENT_NOT_OUTFLOW', 'Só uma saída da conta pode pagar a fatura.', 400);
  }
  const amount = -transaction.amountCents;

  try {
    const result = await db.$transaction(async (tx) => {
      const payments = await tx.cardStatementPayment.findMany({
        where: { profileId: guarded.profileId, cardStatementId: statement.id },
        select: { amountCents: true },
      });
      const paid = payments.reduce((total, payment) => total + payment.amountCents, 0n);
      if (amount > outstandingCents(statement.totalCents, paid)) return null;

      const payment = await tx.cardStatementPayment.create({
        data: {
          profileId: guarded.profileId,
          cardStatementId: statement.id,
          transactionId: transaction.id,
          amountCents: amount,
        },
        select: { id: true },
      });
      const status = await refreshStatementStatus(tx, statement.id);
      return { payment, status };
    });
    if (!result) {
      return fail('PAYMENT_EXCEEDS_OUTSTANDING', 'O lançamento é maior do que falta pagar nesta fatura.', 409);
    }
    return ok({ ...result, replayed: false }, 201);
  } catch (error) {
    // Corrida: outra requisição ligou o mesmo lançamento entre a leitura e a escrita.
    if (isUniqueViolation(error)) {
      return fail('TRANSACTION_ALREADY_LINKED', 'Este lançamento já paga uma fatura.', 409);
    }
    return fail('PAYMENT_FAILED', 'O pagamento não pôde ser conciliado.', 500);
  }
}
