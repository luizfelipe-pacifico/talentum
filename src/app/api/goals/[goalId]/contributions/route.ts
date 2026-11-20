import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { savedCents } from '@/server/goal-metrics';
import { civilDate, idempotencyKey, isUniqueViolation, planningEvent, positiveCents } from '@/server/planning-queries';

/* Contribuição datada para uma meta.

   Idempotente pela chave gerada no cliente: o mesmo pedido repetido (clique
   duplo, nova tentativa de rede) devolve a contribuição já gravada em vez de
   contar duas vezes. Uma retirada nunca deixa a meta com saldo negativo. */

const schema = z
  .object({
    kind: z.enum(['deposit', 'withdrawal']),
    amountCents: positiveCents,
    contributedOn: civilDate,
    idempotencyKey,
  })
  .strict();

class OverdrawnError extends Error {}

export async function POST(request: Request, context: { params: Promise<{ goalId: string }> }) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_CONTRIBUTION', 'A contribuição informada é inválida.', 400);
  const { goalId } = await context.params;
  const profileId = guarded.profileId;

  const goal = await db.goal.findFirst({ where: { id: goalId, profileId }, select: { id: true } });
  if (!goal) return fail('GOAL_NOT_FOUND', 'A meta não foi encontrada.', 404);

  const replay = async () => {
    const existing = await db.goalContribution.findFirst({
      where: { profileId, idempotencyKey: parsed.data.idempotencyKey },
      select: { id: true, goalId: true },
    });
    if (!existing || existing.goalId !== goalId) return fail('IDEMPOTENCY_KEY_REUSED', 'Esse pedido já foi usado para outra contribuição.', 409);
    return ok({ contributionId: existing.id, replayed: true });
  };

  // Pedido já processado: responde o mesmo resultado sem gravar de novo.
  const previous = await db.goalContribution.findFirst({ where: { profileId, idempotencyKey: parsed.data.idempotencyKey }, select: { id: true } });
  if (previous) return replay();

  try {
    const contribution = await db.$transaction(async (tx) => {
      const created = await tx.goalContribution.create({
        data: { profileId, goalId, ...parsed.data },
        select: { id: true },
      });
      // A conferência vem depois da escrita: com a trava de escrita do SQLite já
      // tomada, nenhuma retirada simultânea consegue passar entre a leitura e a gravação.
      const rows = await tx.goalContribution.findMany({ where: { profileId, goalId }, select: { kind: true, amountCents: true } });
      if (savedCents(rows.map((row) => ({ kind: row.kind === 'withdrawal' ? 'withdrawal' : 'deposit', amountCents: row.amountCents }))) < 0n) {
        throw new OverdrawnError();
      }
      await tx.timelineEvent.create({
        data: planningEvent(
          profileId,
          parsed.data.kind === 'withdrawal' ? 'Retirada de meta registrada' : 'Contribuição para meta registrada',
          'O valor guardado de uma meta foi atualizado.',
        ),
      });
      return created;
    });
    return ok({ contributionId: contribution.id, replayed: false }, 201);
  } catch (error) {
    if (error instanceof OverdrawnError) return fail('GOAL_OVERDRAWN', 'A retirada é maior que o valor guardado na meta.', 409);
    if (isUniqueViolation(error)) return replay();
    throw error;
  }
}
