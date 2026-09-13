import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

/* Saldos informados de uma conta.

   Feature 2 de docs/ROUTING_MVP.md. Um saldo é sempre um fato datado: o painel
   soma o snapshot mais recente com os lançamentos posteriores a ele
   (docs/DASHBOARD.md, I-1), então gravar sem data de referência tornaria o
   cálculo indeterminado. */

type Context = { params: Promise<{ accountId: string }> };

const createSchema = z.object({
  /** Centavos inteiros como string. Pode ser negativo — conta fica no vermelho. */
  balanceCents: z.string().regex(/^-?\d{1,18}$/),
  capturedAt: z.string().datetime().optional(),
});

async function ownedAccount(profileId: string, accountId: string) {
  return db.account.findFirst({ where: { id: accountId, profileId }, select: { id: true } });
}

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId } = await context.params;
  const account = await ownedAccount(guarded.profileId, accountId);
  if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);

  const snapshots = await db.balanceSnapshot.findMany({
    where: { accountId: account.id },
    orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
    take: 60,
    select: { id: true, balanceCents: true, capturedAt: true, importBatchId: true, createdAt: true },
  });

  return ok({
    hasProfile: true,
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      balanceCents: snapshot.balanceCents.toString(),
      capturedAt: snapshot.capturedAt.toISOString(),
      createdAt: snapshot.createdAt.toISOString(),
      // Distingue saldo vindo de extrato de saldo informado à mão.
      fromImport: snapshot.importBatchId !== null,
    })),
  });
}

export async function POST(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId } = await context.params;
  const account = await ownedAccount(guarded.profileId, accountId);
  if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_BALANCE', 'O saldo informado é inválido.', 400);

  const snapshot = await db.balanceSnapshot.create({
    data: {
      accountId: account.id,
      balanceCents: BigInt(parsed.data.balanceCents),
      capturedAt: parsed.data.capturedAt ? new Date(parsed.data.capturedAt) : new Date(),
      // Sem lote: este saldo foi declarado, e a reversão de importação não o
      // apaga (docs/DATA_MODEL.md, invariante 6).
      importBatchId: null,
    },
    select: { id: true, balanceCents: true, capturedAt: true },
  });

  return ok(
    {
      snapshot: {
        id: snapshot.id,
        balanceCents: snapshot.balanceCents.toString(),
        capturedAt: snapshot.capturedAt.toISOString(),
      },
    },
    201,
  );
}
