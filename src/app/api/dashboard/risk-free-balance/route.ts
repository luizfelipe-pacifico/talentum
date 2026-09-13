import { guardWithProfile, isDenied, ok } from '@/server/http';
import { cashProjection, endOfMonth, startOfDay } from '@/server/dashboard-metrics';
import { loadConsolidatedBalance, loadOpenObligations } from '@/server/dashboard-queries';

/* Detalhe do Saldo Livre de Risco e projeção de caixa do período.

   Elemento G-1 de docs/DASHBOARD.md: o único do painel que olha para frente.
   Responde "o dinheiro dura até o fim do período?".

   Duas regras de honestidade que a rota implementa:

   1. **Renda futura prevista não entra.** Incorporá-la deixaria de ser Saldo
      Livre de Risco e viraria previsão, que é outra coisa.
   2. A decomposição vem junto do número, para que o veredito seja explicável
      sem clique (R-2). */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const now = new Date();
  const periodEnd = endOfMonth(now);
  const from = startOfDay(now);

  const [balance, obligations] = await Promise.all([
    loadConsolidatedBalance(guarded.profileId),
    loadOpenObligations(guarded.profileId, periodEnd),
  ]);

  const committed = obligations.reduce((total, obligation) => total + obligation.amountCents, 0n);
  const projection = cashProjection(
    balance.cents,
    obligations.map((obligation) => ({
      amountCents: obligation.amountCents,
      dueDate: obligation.dueDate,
      status: obligation.status,
    })),
    from,
    periodEnd,
  );

  const estimated = obligations.filter((obligation) => obligation.isEstimated).length;

  return ok({
    hasProfile: true,
    period: { start: from.toISOString(), end: periodEnd.toISOString() },
    balanceCents: balance.cents.toString(),
    committedCents: committed.toString(),
    riskFreeBalanceCents: (balance.cents - committed).toString(),
    accountsWithKnownBalance: balance.knownAccounts,
    accountsWithUnknownBalance: balance.unknownAccounts,
    /* Quantas obrigações têm valor aproximado. O veredito precisa sinalizar
       quando parte do desconto é estimativa (docs/DASHBOARD.md, L-1). */
    estimatedObligations: estimated,
    obligations: obligations.map((obligation) => ({
      id: obligation.id,
      description: obligation.description,
      amountCents: obligation.amountCents.toString(),
      dueDate: obligation.dueDate.toISOString(),
      isEstimated: obligation.isEstimated,
    })),
    projection: {
      shortfallDay: projection.shortfallDay,
      endingBalanceCents: projection.endingBalanceCents.toString(),
      points: projection.points.map((point) => ({
        day: point.day,
        balanceCents: point.balanceCents.toString(),
        dueCents: point.dueCents.toString(),
      })),
    },
  });
}
