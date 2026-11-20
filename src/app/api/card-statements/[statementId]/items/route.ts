import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { findStatement, isUniqueViolation, itemCreateSchema } from '@/server/card-store';

/* Item de fatura digitado: compra, parcela, estorno ou tarifa.

   Idempotente: o formulário gera `clientKey` uma vez, e o item é gravado com
   `externalId = manual:<clientKey>` sob `@@unique([cardStatementId, externalId])`.
   Reenviar o mesmo formulário devolve o item já gravado, sem duplicar. */

type Context = { params: Promise<{ statementId: string }> };

export async function POST(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { statementId } = await context.params;
  const parsed = itemCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_STATEMENT_ITEM', 'Os dados do item são inválidos.', 400);
  const input = parsed.data;

  const statement = await findStatement(guarded.profileId, statementId);
  if (!statement) return fail('STATEMENT_NOT_FOUND', 'A fatura informada não existe.', 404);

  const externalId = `manual:${input.clientKey}`;
  const existing = await db.cardStatementItem.findFirst({
    where: { cardStatementId: statement.id, externalId, profileId: guarded.profileId },
    select: { id: true },
  });
  if (existing) return ok({ item: existing, replayed: true });

  try {
    const item = await db.cardStatementItem.create({
      data: {
        profileId: guarded.profileId,
        cardStatementId: statement.id,
        occurredOn: input.occurredOn,
        description: input.description,
        amountCents: input.amountCents,
        installmentNumber: input.installmentNumber ?? null,
        installmentCount: input.installmentCount ?? null,
        source: 'manual',
        externalId,
      },
      select: { id: true },
    });
    return ok({ item, replayed: false }, 201);
  } catch (error) {
    // Duas requisições simultâneas com a mesma chave: a segunda encontra a primeira.
    if (isUniqueViolation(error)) {
      const winner = await db.cardStatementItem.findFirst({
        where: { cardStatementId: statement.id, externalId, profileId: guarded.profileId },
        select: { id: true },
      });
      if (winner) return ok({ item: winner, replayed: true });
    }
    return fail('STATEMENT_ITEM_FAILED', 'O item não pôde ser gravado.', 500);
  }
}
