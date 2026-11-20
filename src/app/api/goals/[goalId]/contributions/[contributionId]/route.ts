import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { savedCents } from '@/server/goal-metrics';
import { planningEvent } from '@/server/planning-queries';

class OverdrawnError extends Error {}

/**
 * Remove uma contribuição registrada por engano. Remover um depósito que
 * deixaria a meta negativa (porque houve retirada depois) é recusado.
 */
export async function DELETE(request: Request, context: { params: Promise<{ goalId: string; contributionId: string }> }) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { goalId, contributionId } = await context.params;
  const profileId = guarded.profileId;

  try {
    const removed = await db.$transaction(async (tx) => {
      const result = await tx.goalContribution.deleteMany({ where: { id: contributionId, goalId, profileId } });
      if (result.count !== 1) return 0;
      const rows = await tx.goalContribution.findMany({ where: { profileId, goalId }, select: { kind: true, amountCents: true } });
      if (savedCents(rows.map((row) => ({ kind: row.kind === 'withdrawal' ? 'withdrawal' : 'deposit', amountCents: row.amountCents }))) < 0n) {
        throw new OverdrawnError();
      }
      await tx.timelineEvent.create({ data: planningEvent(profileId, 'Contribuição de meta removida', 'Uma contribuição registrada em uma meta foi removida.') });
      return 1;
    });
    if (removed !== 1) return fail('CONTRIBUTION_NOT_FOUND', 'A contribuição não foi encontrada.', 404);
    return ok({ deleted: true });
  } catch (error) {
    if (error instanceof OverdrawnError) return fail('GOAL_OVERDRAWN', 'Remover esse depósito deixaria a meta com valor guardado negativo. Remova antes a retirada feita depois dele.', 409);
    throw error;
  }
}
