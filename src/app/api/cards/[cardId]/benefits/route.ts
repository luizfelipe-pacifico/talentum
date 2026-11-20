import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { benefitCreateSchema, isUniqueViolation } from '@/server/card-store';

/* Novo programa de benefício do cartão: cashback, pontos ou milhas.

   Um registro por programa (`@@unique([creditCardId, kind, programName])`):
   repetir o cadastro responde 409 em vez de duplicar o saldo. */

type Context = { params: Promise<{ cardId: string }> };

export async function POST(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { cardId } = await context.params;
  const parsed = benefitCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_BENEFIT', 'Os dados do benefício são inválidos.', 400);
  const input = parsed.data;

  if (input.expiringBalance != null && input.expiringBalance > input.balance) {
    return fail('INVALID_BENEFIT', 'O saldo que expira não pode passar do saldo total.', 400);
  }

  const card = await db.creditCard.findFirst({
    where: { id: cardId, profileId: guarded.profileId },
    select: { id: true },
  });
  if (!card) return fail('CARD_NOT_FOUND', 'O cartão informado não existe.', 404);

  try {
    const benefit = await db.cardBenefit.create({
      data: {
        profileId: guarded.profileId,
        creditCardId: card.id,
        kind: input.kind,
        programName: input.programName,
        balance: input.balance,
        expiringBalance: input.expiringBalance ?? null,
        expiresOn: input.expiresOn ?? null,
      },
      select: { id: true },
    });
    return ok({ benefit }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('BENEFIT_ALREADY_EXISTS', 'Este cartão já tem esse programa cadastrado.', 409);
    }
    return fail('BENEFIT_FAILED', 'O benefício não pôde ser cadastrado.', 500);
  }
}
