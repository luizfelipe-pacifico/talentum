import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { benefitPatchSchema, isUniqueViolation } from '@/server/card-store';

/* Um programa de benefício: atualizar saldo e expiração, ou remover. */

type Context = { params: Promise<{ benefitId: string }> };

export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { benefitId } = await context.params;
  const parsed = benefitPatchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_BENEFIT', 'Os dados do benefício são inválidos.', 400);
  const input = parsed.data;

  const benefit = await db.cardBenefit.findFirst({
    where: { id: benefitId, profileId: guarded.profileId },
    select: { id: true, balance: true, expiringBalance: true },
  });
  if (!benefit) return fail('BENEFIT_NOT_FOUND', 'O benefício informado não existe.', 404);

  const balance = input.balance ?? benefit.balance;
  const expiring = input.expiringBalance !== undefined ? input.expiringBalance : benefit.expiringBalance;
  if (expiring !== null && expiring > balance) {
    return fail('INVALID_BENEFIT', 'O saldo que expira não pode passar do saldo total.', 400);
  }

  try {
    await db.cardBenefit.update({ where: { id: benefit.id, profileId: guarded.profileId }, data: input });
    return ok({ updated: true });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail('BENEFIT_ALREADY_EXISTS', 'Este cartão já tem esse programa cadastrado.', 409);
    }
    return fail('BENEFIT_FAILED', 'O benefício não pôde ser alterado.', 500);
  }
}

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { benefitId } = await context.params;
  // `deleteMany` escopado por perfil: repetir a remoção responde 404, sem erro interno.
  const removed = await db.cardBenefit.deleteMany({ where: { id: benefitId, profileId: guarded.profileId } });
  if (removed.count === 0) return fail('BENEFIT_NOT_FOUND', 'O benefício informado não existe.', 404);
  return ok({ deleted: true });
}
