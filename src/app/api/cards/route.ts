import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { cardCreateSchema, isUniqueViolation, listCards } from '@/server/card-store';

/* Cartões de crédito do perfil local (Stage 8, docs/PRODUCT.md).

   Nenhum número de cartão, CVV, senha ou credencial é aceito: um apelido e, se
   a pessoa quiser, os quatro últimos dígitos para distinguir cartões. */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  return ok({ hasProfile: true, cards: await listCards(guarded.profileId, new Date()) });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const parsed = cardCreateSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_CARD', 'Os dados do cartão são inválidos.', 400);

  const { profileId } = guarded;
  const input = parsed.data;

  let institutionId: string | null = null;
  if (input.institutionId) {
    const institution = await db.institution.findFirst({
      where: { id: input.institutionId, profileId },
      select: { id: true },
    });
    if (!institution) return fail('INSTITUTION_NOT_FOUND', 'A instituição informada não existe.', 404);
    institutionId = institution.id;
  }

  if (input.paymentAccountId) {
    const account = await db.account.findFirst({
      where: { id: input.paymentAccountId, profileId },
      select: { id: true },
    });
    if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);
  }

  try {
    const card = await db.$transaction(async (tx) => {
      if (!institutionId && input.institutionName) {
        const existing = await tx.institution.findFirst({
          where: { profileId, name: input.institutionName },
          select: { id: true },
        });
        institutionId =
          existing?.id ??
          (await tx.institution.create({ data: { profileId, name: input.institutionName }, select: { id: true } })).id;
      }

      return tx.creditCard.create({
        data: {
          profileId,
          institutionId,
          paymentAccountId: input.paymentAccountId ?? null,
          name: input.name,
          lastFourDigits: input.lastFourDigits ?? null,
          closingDay: input.closingDay ?? null,
          dueDay: input.dueDay,
          limitCents: input.limitCents ?? null,
          annualFeeCents: input.annualFeeCents ?? null,
          feeWaiverSpendCents: input.feeWaiverSpendCents ?? null,
          feeWaiverPeriod: input.feeWaiverPeriod ?? null,
        },
        select: { id: true, name: true },
      });
    });
    return ok({ card }, 201);
  } catch (error) {
    // Apelido único por perfil: um clique repetido não cria um segundo cartão.
    if (isUniqueViolation(error)) {
      return fail('CARD_ALREADY_EXISTS', 'Já existe um cartão com esse apelido.', 409);
    }
    return fail('CARD_FAILED', 'O cartão não pôde ser cadastrado.', 500);
  }
}
