import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { annualEquivalentBps, orderDebts } from '@/server/debt-metrics';
import { loadSurvival, nonNegativeCents, planningEvent, positiveCents, shortName, toWire } from '@/server/planning-queries';

/* Dívidas (Stage 13). Pede só o que a pessoa sabe: nome, saldo devedor, taxa
   mensal, parcela mínima, atraso e dia de vencimento. Nunca contrato,
   documento ou credencial (docs/PRODUCT.md, Block 5). */

const createSchema = z
  .object({
    name: shortName,
    principalCents: positiveCents,
    // Taxa mensal em pontos-base; teto de 50% ao mês contra erro de digitação.
    monthlyRateBps: z.number().int().min(0).max(5_000),
    minimumPaymentCents: nonNegativeCents,
    overdueCents: nonNegativeCents.default(0n),
    dueDay: z.number().int().min(1).max(31).nullable().optional(),
  })
  .strict();

const debtSelect = {
  id: true,
  name: true,
  principalCents: true,
  monthlyRateBps: true,
  minimumPaymentCents: true,
  overdueCents: true,
  dueDay: true,
  status: true,
} as const;

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const [debts, survival] = await Promise.all([
    db.debt.findMany({ where: { profileId: guarded.profileId }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], select: debtSelect }),
    loadSurvival(guarded.profileId, new Date()),
  ]);
  const open = debts.filter((debt) => debt.status === 'open');
  const totals = open.reduce(
    (sum, debt) => ({
      principalCents: sum.principalCents + debt.principalCents,
      minimumCents: sum.minimumCents + debt.minimumPaymentCents,
      overdueCents: sum.overdueCents + debt.overdueCents,
    }),
    { principalCents: 0n, minimumCents: 0n, overdueCents: 0n },
  );
  return ok({
    hasProfile: true,
    debts: toWire(debts.map((debt) => ({ ...debt, annualRateBps: annualEquivalentBps(debt.monthlyRateBps) }))),
    order: { avalanche: orderDebts(open, 'avalanche').map((debt) => debt.id), snowball: orderDebts(open, 'snowball').map((debt) => debt.id) },
    totals: toWire(totals),
    survival: toWire(survival),
  });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_DEBT', 'A dívida informada é inválida.', 400);
  const debt = await db.$transaction(async (tx) => {
    const created = await tx.debt.create({ data: { profileId: guarded.profileId, ...parsed.data, dueDay: parsed.data.dueDay ?? null }, select: { id: true } });
    await tx.timelineEvent.create({ data: planningEvent(guarded.profileId, 'Dívida cadastrada', 'Uma dívida foi cadastrada no planejamento.') });
    return created;
  });
  return ok({ debtId: debt.id }, 201);
}
