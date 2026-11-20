import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { isUniqueViolation, statementCreateSchema } from '@/server/card-store';

/* Nova fatura de um cartão.

   Uma fatura por vencimento (`@@unique([creditCardId, dueDate])`): repetir o
   cadastro, por clique duplo ou por outra aba, responde 409 em vez de criar
   uma segunda fatura que seria descontada duas vezes do Saldo Livre de Risco. */

type Context = { params: Promise<{ cardId: string }> };

export async function POST(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { cardId } = await context.params;
  const parsed = statementCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_STATEMENT', 'Os dados da fatura são inválidos.', 400);
  const input = parsed.data;

  const card = await db.creditCard.findFirst({
    where: { id: cardId, profileId: guarded.profileId },
    select: { id: true },
  });
  if (!card) return fail('CARD_NOT_FOUND', 'O cartão informado não existe.', 404);

  try {
    const statement = await db.cardStatement.create({
      data: {
        profileId: guarded.profileId,
        creditCardId: card.id,
        periodStart: input.periodStart ?? null,
        closingDate: input.closingDate,
        dueDate: input.dueDate,
        totalCents: input.totalCents,
        isEstimated: input.isEstimated,
      },
      select: { id: true },
    });
    return ok({ statement }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('STATEMENT_ALREADY_EXISTS', 'Este cartão já tem uma fatura com esse vencimento.', 409);
    }
    return fail('STATEMENT_FAILED', 'A fatura não pôde ser cadastrada.', 500);
  }
}
