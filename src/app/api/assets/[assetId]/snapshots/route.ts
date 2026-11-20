import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { civilDate, idempotencyKey, isUniqueViolation, nonNegativeCents, planningEvent, toWire } from '@/server/planning-queries';

/* Valores datados de um bem. Cada valor é um fato novo; o anterior fica no
   histórico. Idempotente pela chave gerada no cliente. */

const schema = z.object({ valueCents: nonNegativeCents, capturedAt: civilDate, idempotencyKey }).strict();

type Context = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { assetId } = await context.params;
  const asset = await db.asset.findFirst({ where: { id: assetId, profileId: guarded.profileId }, select: { id: true, name: true, pillar: true, isActive: true } });
  if (!asset) return fail('ASSET_NOT_FOUND', 'O bem não foi encontrado.', 404);
  const snapshots = await db.assetSnapshot.findMany({
    where: { profileId: guarded.profileId, assetId },
    orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
    take: 120,
    select: { id: true, valueCents: true, capturedAt: true },
  });
  return ok({ hasProfile: true, asset, snapshots: toWire(snapshots) });
}

export async function POST(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_ASSET_VALUE', 'O valor informado é inválido.', 400);
  const { assetId } = await context.params;
  const profileId = guarded.profileId;

  const asset = await db.asset.findFirst({ where: { id: assetId, profileId }, select: { id: true } });
  if (!asset) return fail('ASSET_NOT_FOUND', 'O bem não foi encontrado.', 404);

  const replay = async () => {
    const existing = await db.assetSnapshot.findFirst({ where: { profileId, idempotencyKey: parsed.data.idempotencyKey }, select: { id: true, assetId: true } });
    if (!existing || existing.assetId !== assetId) return fail('IDEMPOTENCY_KEY_REUSED', 'Esse pedido já foi usado para outro valor.', 409);
    return ok({ snapshotId: existing.id, replayed: true });
  };

  const previous = await db.assetSnapshot.findFirst({ where: { profileId, idempotencyKey: parsed.data.idempotencyKey }, select: { id: true } });
  if (previous) return replay();

  try {
    const snapshot = await db.$transaction(async (tx) => {
      const created = await tx.assetSnapshot.create({ data: { profileId, assetId, ...parsed.data }, select: { id: true } });
      await tx.timelineEvent.create({ data: planningEvent(profileId, 'Valor de bem atualizado', 'Um novo valor datado foi registrado para um bem do patrimônio.') });
      return created;
    });
    return ok({ snapshotId: snapshot.id, replayed: false }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return replay();
    throw error;
  }
}
