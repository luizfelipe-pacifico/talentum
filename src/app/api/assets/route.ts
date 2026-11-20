import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { civilDate, idempotencyKey, isUniqueViolation, nonNegativeCents, planningEvent, shortName, toWire } from '@/server/planning-queries';
import { ASSET_PILLARS, loadAssets } from '@/server/portfolio-queries';

/* Bens do patrimônio (Stage 14). Cada bem nasce com um valor datado; o valor
   nunca é sobrescrito, só acrescido de um novo registro. */

const createSchema = z
  .object({
    name: shortName,
    pillar: z.enum(ASSET_PILLARS),
    valueCents: nonNegativeCents,
    capturedAt: civilDate,
    idempotencyKey,
  })
  .strict();

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  return ok({ hasProfile: true, assets: toWire(await loadAssets(guarded.profileId)) });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_ASSET', 'O bem informado é inválido.', 400);
  const { name, pillar, valueCents, capturedAt } = parsed.data;
  const profileId = guarded.profileId;

  const replay = async () => {
    const snapshot = await db.assetSnapshot.findFirst({ where: { profileId, idempotencyKey: parsed.data.idempotencyKey }, select: { assetId: true } });
    if (!snapshot) return fail('IDEMPOTENCY_KEY_REUSED', 'Esse pedido não pôde ser repetido.', 409);
    return ok({ assetId: snapshot.assetId, replayed: true });
  };

  // A chave de idempotência mora no primeiro valor: o mesmo pedido não cria dois bens.
  const previous = await db.assetSnapshot.findFirst({ where: { profileId, idempotencyKey: parsed.data.idempotencyKey }, select: { id: true } });
  if (previous) return replay();

  try {
    const asset = await db.$transaction(async (tx) => {
      const created = await tx.asset.create({ data: { profileId, name, pillar }, select: { id: true } });
      await tx.assetSnapshot.create({ data: { profileId, assetId: created.id, valueCents, capturedAt, idempotencyKey: parsed.data.idempotencyKey } });
      await tx.timelineEvent.create({ data: planningEvent(profileId, 'Bem cadastrado no patrimônio', 'Um bem foi cadastrado com o primeiro valor informado.') });
      return created;
    });
    return ok({ assetId: asset.id, replayed: false }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return replay();
    throw error;
  }
}
