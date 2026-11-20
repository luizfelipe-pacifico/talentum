import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { planningEvent, shortName } from '@/server/planning-queries';
import { ASSET_PILLARS } from '@/server/portfolio-queries';

const patchSchema = z
  .object({ name: shortName.optional(), pillar: z.enum(ASSET_PILLARS).optional(), isActive: z.boolean().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

type Context = { params: Promise<{ assetId: string }> };

/** Renomeia, troca o pilar ou retira o bem do patrimônio sem apagar o histórico. */
export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_ASSET', 'O bem informado é inválido.', 400);
  const { assetId } = await context.params;
  const updated = await db.asset.updateMany({ where: { id: assetId, profileId: guarded.profileId }, data: parsed.data });
  if (updated.count !== 1) return fail('ASSET_NOT_FOUND', 'O bem não foi encontrado.', 404);
  return ok({ updated: true });
}

/** Exclui o bem e todos os valores registrados dele. */
export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { assetId } = await context.params;
  const removed = await db.$transaction(async (tx) => {
    const result = await tx.asset.deleteMany({ where: { id: assetId, profileId: guarded.profileId } });
    if (result.count === 1) await tx.timelineEvent.create({ data: planningEvent(guarded.profileId, 'Bem excluído do patrimônio', 'Um bem e os valores registrados dele foram excluídos.') });
    return result.count;
  });
  if (removed !== 1) return fail('ASSET_NOT_FOUND', 'O bem não foi encontrado.', 404);
  return ok({ deleted: true });
}
