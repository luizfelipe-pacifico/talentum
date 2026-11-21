import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

const obligationSchema = z.object({
  description: z.string().trim().min(1).max(100),
  amountCents: z.string().regex(/^\d+$/).transform(BigInt).refine((value) => value > 0n),
  dueDate: z.string().datetime(), status: z.enum(['open', 'paid', 'cancelled']).default('open'),
  recurrence: z.enum(['none', 'weekly', 'monthly', 'yearly']).default('none'),
  isEstimated: z.boolean().default(false), accountId: z.string().uuid().nullable().optional(), categoryId: z.string().uuid().nullable().optional(),
  /* Cartão cuja fatura este compromisso representa. Com fatura do mesmo cartão
     e mês, o painel não desconta o compromisso (docs/PRODUCT.md, V). */
  creditCardId: z.string().uuid().nullable().optional(),
  /* Uma chave por envio do formulário: o reenvio devolve o mesmo compromisso. */
  idempotencyKey: z.string().uuid(),
}).strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const obligations = await db.scheduledObligation.findMany({ where: { profileId: guarded.profileId }, orderBy: [{ dueDate: 'asc' }, { description: 'asc' }], select: { id: true, description: true, amountCents: true, dueDate: true, status: true, recurrence: true, isEstimated: true, accountId: true, categoryId: true, creditCardId: true } });
  return ok({ hasProfile: true, obligations: obligations.map((item) => ({ ...item, amountCents: item.amountCents.toString(), dueDate: item.dueDate.toISOString() })) });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request); if (isDenied(guarded)) return guarded.response;
  const parsed = obligationSchema.safeParse(await readJson(request)); if (!parsed.success) return fail('INVALID_OBLIGATION', 'O compromisso informado é inválido.', 400);
  const { accountId, categoryId, creditCardId } = parsed.data;
  const [account, category, card] = await Promise.all([
    accountId ? db.account.findFirst({ where: { id: accountId, profileId: guarded.profileId }, select: { id: true } }) : null,
    categoryId ? db.category.findFirst({ where: { id: categoryId, profileId: guarded.profileId }, select: { id: true } }) : null,
    creditCardId ? db.creditCard.findFirst({ where: { id: creditCardId, profileId: guarded.profileId }, select: { id: true } }) : null,
  ]);
  if (accountId && !account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não foi encontrada.', 404);
  if (categoryId && !category) return fail('CATEGORY_NOT_FOUND', 'A categoria não foi encontrada.', 404);
  if (creditCardId && !card) return fail('CARD_NOT_FOUND', 'O cartão informado não foi encontrado.', 404);
  const key = { profileId: guarded.profileId, idempotencyKey: parsed.data.idempotencyKey };
  // Reenvio do mesmo formulário (duplo clique, nova tentativa após falha de rede): devolve o que já existe.
  const previous = await db.scheduledObligation.findFirst({ where: { profileId: guarded.profileId, idempotencyKey: key.idempotencyKey }, select: { id: true } });
  if (previous) return ok({ obligationId: previous.id }, 200);
  try {
    const created = await db.scheduledObligation.create({ data: { profileId: guarded.profileId, ...parsed.data, dueDate: new Date(parsed.data.dueDate) }, select: { id: true } });
    return ok({ obligationId: created.id }, 201);
  } catch (error) {
    // Dois pedidos simultâneos passam pela consulta acima; a restrição única escolhe o vencedor.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await db.scheduledObligation.findFirst({ where: key, select: { id: true } });
      if (winner) return ok({ obligationId: winner.id }, 200);
    }
    throw error;
  }
}
