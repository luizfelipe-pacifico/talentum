import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { cardPatchSchema, isUniqueViolation, loadCardDetail } from '@/server/card-store';

/* Um cartão: detalhe, edição, desativação e remoção.

   Remover cartão com faturas é recusado: as faturas cairiam em cascata e o
   histórico de pagamentos conciliados sumiria. Desativar preserva tudo. */

type Context = { params: Promise<{ cardId: string }> };

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { cardId } = await context.params;
  const card = await loadCardDetail(guarded.profileId, cardId, new Date());
  if (!card) return fail('CARD_NOT_FOUND', 'O cartão informado não existe.', 404);
  return ok({ hasProfile: true, card });
}

export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { cardId } = await context.params;
  const parsed = cardPatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_CARD', 'Os dados do cartão são inválidos.', 400);
  const input = parsed.data;

  const card = await db.creditCard.findFirst({
    where: { id: cardId, profileId: guarded.profileId },
    select: { id: true, feeWaiverSpendCents: true, feeWaiverPeriod: true },
  });
  if (!card) return fail('CARD_NOT_FOUND', 'O cartão informado não existe.', 404);

  // A regra de isenção precisa dos dois campos juntos depois da edição.
  const nextSpend = input.feeWaiverSpendCents !== undefined ? input.feeWaiverSpendCents : card.feeWaiverSpendCents;
  const nextPeriod = input.feeWaiverPeriod !== undefined ? input.feeWaiverPeriod : card.feeWaiverPeriod;
  if ((nextSpend === null) !== (nextPeriod === null)) {
    return fail('INVALID_CARD', 'A regra de isenção precisa do valor e do período.', 400);
  }

  if (input.paymentAccountId) {
    const account = await db.account.findFirst({
      where: { id: input.paymentAccountId, profileId: guarded.profileId },
      select: { id: true },
    });
    if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);
  }

  try {
    const updated = await db.creditCard.update({
      where: { id: card.id, profileId: guarded.profileId },
      data: input,
      select: { id: true, name: true, isActive: true },
    });
    return ok({ card: updated });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('CARD_ALREADY_EXISTS', 'Já existe um cartão com esse apelido.', 409);
    }
    return fail('CARD_FAILED', 'O cartão não pôde ser alterado.', 500);
  }
}

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { cardId } = await context.params;
  const card = await db.creditCard.findFirst({
    where: { id: cardId, profileId: guarded.profileId },
    select: { id: true, _count: { select: { statements: true } } },
  });
  if (!card) return fail('CARD_NOT_FOUND', 'O cartão informado não existe.', 404);
  if (card._count.statements > 0) {
    return fail('CARD_HAS_STATEMENTS', 'O cartão tem faturas. Desative-o para preservar o histórico.', 409);
  }

  await db.creditCard.deleteMany({ where: { id: card.id, profileId: guarded.profileId } });
  return ok({ deleted: true });
}
