import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

/* Uma conta.

   Feature 2 de docs/ROUTING_MVP.md. `PATCH` edita e desativa; `DELETE` só
   remove conta sem histórico. Toda operação é escopada por perfil. */

type Context = { params: Promise<{ accountId: string }> };

const ACCOUNT_TYPES = ['checking', 'payment', 'savings', 'brokerage', 'wallet', 'cash'] as const;

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    isActive: z.boolean().optional(),
    /** `null` desvincula a conta da instituição. */
    institutionId: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'nada a alterar' });

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId } = await context.params;
  const account = await db.account.findFirst({
    where: { id: accountId, profileId: guarded.profileId },
    select: {
      id: true,
      name: true,
      type: true,
      currency: true,
      isActive: true,
      createdAt: true,
      institution: { select: { id: true, name: true } },
      balanceSnapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 12,
        select: { id: true, balanceCents: true, capturedAt: true, importBatchId: true },
      },
      pixIdentifiers: {
        orderBy: { createdAt: 'asc' },
        // O valor cifrado nunca entra numa listagem: só a forma mascarada.
        select: { id: true, type: true, label: true, maskedValue: true, isActive: true, source: true },
      },
      _count: { select: { transactions: true, importBatches: true, obligations: true } },
    },
  });
  if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);

  const snapshots = account.balanceSnapshots;

  return ok({
    hasProfile: true,
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      isActive: account.isActive,
      createdAt: account.createdAt.toISOString(),
      institution: account.institution,
      transactionCount: account._count.transactions,
      importBatchCount: account._count.importBatches,
      obligationCount: account._count.obligations,
      // Ausência de saldo é declarada, nunca convertida em zero.
      balanceCents: snapshots[0] ? snapshots[0].balanceCents.toString() : null,
      balanceCapturedAt: snapshots[0] ? snapshots[0].capturedAt.toISOString() : null,
      balanceHistory: snapshots.map((snapshot) => ({
        id: snapshot.id,
        balanceCents: snapshot.balanceCents.toString(),
        capturedAt: snapshot.capturedAt.toISOString(),
        fromImport: snapshot.importBatchId !== null,
      })),
      pixIdentifiers: account.pixIdentifiers,
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId } = await context.params;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_ACCOUNT', 'Os dados da conta são inválidos.', 400);

  const account = await db.account.findFirst({
    where: { id: accountId, profileId: guarded.profileId },
    select: { id: true, currency: true, _count: { select: { transactions: true } } },
  });
  if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);

  const input = parsed.data;

  if (input.institutionId) {
    const institution = await db.institution.findFirst({
      where: { id: input.institutionId, profileId: guarded.profileId },
      select: { id: true },
    });
    if (!institution) return fail('INSTITUTION_NOT_FOUND', 'A instituição informada não existe.', 404);
  }

  /* Trocar a moeda de uma conta que já tem lançamentos reinterpretaria valores
     passados: os centavos gravados continuariam iguais, mas passariam a
     significar outra coisa. `DATA_MODEL.md` exige moeda explícita por conta. */
  if (input.currency && input.currency !== account.currency && account._count.transactions > 0) {
    return fail(
      'ACCOUNT_CURRENCY_LOCKED',
      'A moeda não pode mudar depois que a conta já tem lançamentos.',
      409,
    );
  }

  const updated = await db.account.update({
    where: { id: account.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.institutionId !== undefined ? { institutionId: input.institutionId } : {}),
    },
    select: { id: true, name: true, type: true, currency: true, isActive: true },
  });

  return ok({ account: updated });
}

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId } = await context.params;
  const account = await db.account.findFirst({
    where: { id: accountId, profileId: guarded.profileId },
    select: { id: true, _count: { select: { transactions: true, importBatches: true } } },
  });
  if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);

  /* A chave estrangeira de `Transaction` é `CASCADE`: excluir uma conta com
     histórico apagaria em silêncio todos os lançamentos importados para ela.
     `DATA_MODEL.md` exige que exclusão com impacto histórico seja recuperável,
     e aqui não seria — então a rota recusa e aponta a desativação, que preserva
     o histórico e tira a conta dos totais. */
  if (account._count.transactions > 0 || account._count.importBatches > 0) {
    return fail(
      'ACCOUNT_HAS_HISTORY',
      'Esta conta tem histórico importado. Desative-a em vez de excluí-la.',
      409,
    );
  }

  await db.account.delete({ where: { id: account.id } });
  return ok({ removed: true });
}
