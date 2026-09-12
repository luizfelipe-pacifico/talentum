import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

/* Contas do perfil local.

   Feature 2 de docs/ROUTING_MVP.md. O saldo informado, quando existir, entra
   como `BalanceSnapshot` com data de referência — o painel distingue conta com
   saldo conhecido de conta sem saldo, e nunca trata ausência como zero
   (docs/DASHBOARD.md, I-1). */

/** Tipos aceitos, espelhando docs/ONBOARDING.md, Bloco 2. */
const ACCOUNT_TYPES = ['checking', 'payment', 'savings', 'brokerage', 'wallet', 'cash'] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  institutionId: z.string().trim().min(1).max(64).optional(),
  institutionName: z.string().trim().min(1).max(120).optional(),
  currency: z.string().trim().length(3).toUpperCase().default('BRL'),
  /** Saldo conhecido em centavos inteiros, como string. Pode ser negativo. */
  balanceCents: z.string().regex(/^-?\d{1,18}$/).optional(),
  balanceCapturedAt: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const accounts = await db.account.findMany({
    where: { profileId: guarded.profileId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      type: true,
      currency: true,
      isActive: true,
      institution: { select: { id: true, name: true } },
      balanceSnapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
        select: { balanceCents: true, capturedAt: true },
      },
      _count: { select: { transactions: true } },
    },
  });

  return ok({
    hasProfile: true,
    accounts: accounts.map((account) => {
      const snapshot = account.balanceSnapshots[0] ?? null;
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        isActive: account.isActive,
        institution: account.institution,
        transactionCount: account._count.transactions,
        // Ausência de saldo é declarada, não convertida em zero.
        balanceCents: snapshot ? snapshot.balanceCents.toString() : null,
        balanceCapturedAt: snapshot ? snapshot.capturedAt.toISOString() : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_ACCOUNT', 'Os dados da conta são inválidos.', 400);

  const { profileId } = guarded;
  const input = parsed.data;

  let institutionId: string | null = null;

  if (input.institutionId) {
    // A instituição precisa pertencer ao mesmo perfil: um ID opaco não é
    // autorização (docs/ESTRUTURA_DE_DADOS.md, §4).
    const institution = await db.institution.findFirst({
      where: { id: input.institutionId, profileId },
      select: { id: true },
    });
    if (!institution) return fail('INSTITUTION_NOT_FOUND', 'A instituição informada não existe.', 404);
    institutionId = institution.id;
  } else if (input.institutionName) {
    const existing = await db.institution.findFirst({
      where: { profileId, name: input.institutionName },
      select: { id: true },
    });
    institutionId =
      existing?.id ??
      (await db.institution.create({ data: { profileId, name: input.institutionName }, select: { id: true } })).id;
  }

  const account = await db.$transaction(async (tx) => {
    const created = await tx.account.create({
      data: {
        profileId,
        institutionId,
        name: input.name,
        type: input.type,
        currency: input.currency,
      },
      select: { id: true, name: true, type: true, currency: true },
    });

    if (input.balanceCents !== undefined) {
      await tx.balanceSnapshot.create({
        data: {
          accountId: created.id,
          balanceCents: BigInt(input.balanceCents),
          capturedAt: input.balanceCapturedAt ? new Date(input.balanceCapturedAt) : new Date(),
        },
      });
    }

    return created;
  });

  return ok({ account }, 201);
}
