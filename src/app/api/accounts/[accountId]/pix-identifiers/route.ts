import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { PIX_KEY_TYPES, PixParseError, preparePixKey, type PixKeyType } from '@/server/pix';

/* Chaves PIX próprias de uma conta.

   Feature 2 de docs/ROUTING_MVP.md e Bloco 3 de docs/ONBOARDING.md. Servem só
   para reconhecer transferência entre contas da própria pessoa.

   A listagem devolve **apenas a forma mascarada**. O valor em claro não sai
   daqui, e o cifrado tampouco: quem quiser ver a própria chave usa a rota do
   item, com pedido explícito. */

type Context = { params: Promise<{ accountId: string }> };

const createSchema = z.object({
  type: z.enum(PIX_KEY_TYPES as unknown as [PixKeyType, ...PixKeyType[]]),
  value: z.string().trim().min(1).max(320),
  label: z.string().trim().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId } = await context.params;
  const account = await db.account.findFirst({
    where: { id: accountId, profileId: guarded.profileId },
    select: { id: true },
  });
  if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);

  const identifiers = await db.pixIdentifier.findMany({
    where: { accountId: account.id, profileId: guarded.profileId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      type: true,
      label: true,
      maskedValue: true,
      isActive: true,
      source: true,
      validFrom: true,
      validUntil: true,
    },
  });

  return ok({
    hasProfile: true,
    pixIdentifiers: identifiers.map((identifier) => ({
      ...identifier,
      validFrom: identifier.validFrom?.toISOString() ?? null,
      validUntil: identifier.validUntil?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { accountId } = await context.params;
  const account = await db.account.findFirst({
    where: { id: accountId, profileId: guarded.profileId },
    select: { id: true },
  });
  if (!account) return fail('ACCOUNT_NOT_FOUND', 'A conta informada não existe.', 404);

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_PIX_KEY', 'A chave informada é inválida.', 400);

  let prepared;
  try {
    prepared = await preparePixKey(parsed.data.type, parsed.data.value);
  } catch (error) {
    if (error instanceof PixParseError) {
      return fail(error.code, 'A chave informada não corresponde ao tipo escolhido.', 400);
    }
    // Falha ao derivar a chave do dispositivo: não gravar nada em claro.
    return fail('PIX_KEY_UNAVAILABLE', 'A chave não pôde ser protegida neste dispositivo.', 500);
  }

  /* Unicidade por perfil, verificada pelo índice HMAC — a mesma chave não
     pertence a duas contas da mesma pessoa. A mensagem não revela em qual
     conta ela já está: quem pergunta já deveria saber. */
  const existing = await db.pixIdentifier.findFirst({
    where: { profileId: guarded.profileId, valueIndex: prepared.valueIndex },
    select: { id: true },
  });
  if (existing) return fail('PIX_KEY_ALREADY_REGISTERED', 'Esta chave já está cadastrada.', 409);

  const created = await db.pixIdentifier.create({
    data: {
      profileId: guarded.profileId,
      accountId: account.id,
      type: prepared.type,
      label: parsed.data.label ?? null,
      valueIndex: prepared.valueIndex,
      valueCiphertext: prepared.valueCiphertext,
      maskedValue: prepared.maskedValue,
      isActive: parsed.data.isActive ?? true,
      validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
      source: 'declared',
    },
    select: { id: true, type: true, label: true, maskedValue: true, isActive: true },
  });

  return ok({ pixIdentifier: created }, 201);
}
