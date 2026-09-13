import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { decryptPixKey } from '@/server/pix';

/* Uma chave PIX própria.

   `GET` devolve a forma mascarada. Com `?reveal=1` devolve o valor em claro —
   pedido explícito, resposta `no-store`, e o valor nunca aparece em listagem,
   log ou mensagem de erro (docs/ONBOARDING.md, docs/SECURITY.md). */

type Context = { params: Promise<{ accountId: string; pixIdentifierId: string }> };

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(60).nullable().optional(),
    isActive: z.boolean().optional(),
    validFrom: z.string().datetime().nullable().optional(),
    validUntil: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'nada a alterar' });

/** Resolve a chave garantindo que ela pertence ao perfil e à conta do caminho. */
async function ownedIdentifier(profileId: string, accountId: string, pixIdentifierId: string) {
  return db.pixIdentifier.findFirst({
    where: { id: pixIdentifierId, accountId, profileId },
    select: {
      id: true,
      type: true,
      label: true,
      maskedValue: true,
      isActive: true,
      source: true,
      validFrom: true,
      validUntil: true,
      valueCiphertext: true,
    },
  });
}

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId, pixIdentifierId } = await context.params;
  const identifier = await ownedIdentifier(guarded.profileId, accountId, pixIdentifierId);
  if (!identifier) return fail('PIX_KEY_NOT_FOUND', 'A chave informada não existe.', 404);

  const reveal = new URL(request.url).searchParams.get('reveal') === '1';
  let value: string | null = null;

  if (reveal) {
    try {
      value = await decryptPixKey(identifier.valueCiphertext);
    } catch {
      // Conteúdo adulterado ou chave do dispositivo trocada: a tag de
      // autenticação do AES-GCM faz a decifragem falhar em vez de devolver lixo.
      return fail('PIX_KEY_UNREADABLE', 'A chave não pôde ser lida neste dispositivo.', 409);
    }
  }

  return ok({
    hasProfile: true,
    pixIdentifier: {
      id: identifier.id,
      type: identifier.type,
      label: identifier.label,
      maskedValue: identifier.maskedValue,
      isActive: identifier.isActive,
      source: identifier.source,
      validFrom: identifier.validFrom?.toISOString() ?? null,
      validUntil: identifier.validUntil?.toISOString() ?? null,
      // Presente apenas quando pedido explicitamente.
      value,
    },
  });
}

export async function PATCH(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId, pixIdentifierId } = await context.params;
  const identifier = await ownedIdentifier(guarded.profileId, accountId, pixIdentifierId);
  if (!identifier) return fail('PIX_KEY_NOT_FOUND', 'A chave informada não existe.', 404);

  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_PIX_KEY', 'Os dados da chave são inválidos.', 400);
  const input = parsed.data;

  /* O valor da chave não é editável: mudá-lo trocaria o índice de comparação e
     o histórico de pareamento deixaria de fazer sentido. Para outra chave,
     cadastre outra — e desative esta, que continua explicando extratos antigos. */
  const updated = await db.pixIdentifier.update({
    where: { id: identifier.id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.validFrom !== undefined
        ? { validFrom: input.validFrom ? new Date(input.validFrom) : null }
        : {}),
      ...(input.validUntil !== undefined
        ? { validUntil: input.validUntil ? new Date(input.validUntil) : null }
        : {}),
    },
    select: { id: true, type: true, label: true, maskedValue: true, isActive: true },
  });

  return ok({ pixIdentifier: updated });
}

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId, pixIdentifierId } = await context.params;
  const identifier = await ownedIdentifier(guarded.profileId, accountId, pixIdentifierId);
  if (!identifier) return fail('PIX_KEY_NOT_FOUND', 'A chave informada não existe.', 404);

  await db.pixIdentifier.delete({ where: { id: identifier.id } });
  return ok({ removed: true });
}
