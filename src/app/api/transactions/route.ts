import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, prismaFailure, readJson } from '@/server/http';
import { createManualEntry, ManualEntryError } from '@/server/manual-entries';

/* Listagem de lançamentos.

   Feature 5 de docs/PRODUCT.md. Filtros e ordenação são validados no
   backend; o cliente não envia nome de coluna nem cláusula de ordenação
   (docs/DATABASE.md, §9). A paginação é por cursor opaco, não por
   `OFFSET`. A resposta é um DTO mínimo, nunca o modelo do ORM. */

const querySchema = z.object({
  accountId: z.string().trim().min(1).max(64).optional(),
  importBatchId: z.string().trim().min(1).max(64).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().min(1).max(64).optional(),
});

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail('INVALID_QUERY', 'Os filtros informados são inválidos.', 400);

  const { accountId, importBatchId, from, to, search, limit, cursor } = parsed.data;

  const where = {
    profileId: guarded.profileId,
    ...(accountId ? { accountId } : {}),
    ...(importBatchId ? { importBatchId } : {}),
    ...(from || to
      ? { occurredOn: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
    ...(search ? { description: { contains: search } } : {}),
  };

  const rows = await db.transaction.findMany({
    where,
    // Ordenação determinística com desempate por id: sem isso o cursor pula
    // linhas quando dois lançamentos compartilham a mesma data.
    orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      occurredOn: true,
      description: true,
      amountCents: true,
      status: true,
      account: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, kind: true } },
      importBatchId: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const total = await db.transaction.count({ where });

  return ok({
    hasProfile: true,
    total,
    transactions: page.map((row) => ({
      id: row.id,
      occurredOn: row.occurredOn.toISOString(),
      description: row.description,
      amountCents: row.amountCents.toString(),
      status: row.status,
      account: row.account,
      category: row.category,
      importBatchId: row.importBatchId,
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

/* Lançamento manual em dinheiro (MVP 5 de docs/ROADMAP.md).

   O valor viaja como centavos inteiros em string, com sinal: negativo é gasto,
   positivo é entrada. A data é um dia civil `AAAA-MM-DD`, nunca no futuro e no
   máximo um ano para trás. A chave de idempotência é um UUID gerado pelo
   cliente uma vez por formulário. */
const manualSchema = z.object({
  accountId: z.string().uuid(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(120),
  amountCents: z.string().regex(/^-?\d{1,13}$/).refine((value) => BigInt(value) !== 0n),
  categoryId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().uuid(),
}).strict();

const MANUAL_ERRORS: Record<string, [string, number]> = {
  ACCOUNT_NOT_FOUND: ['A conta informada não existe ou está desativada.', 404],
  ACCOUNT_NOT_CASH: ['Lançamentos à mão só podem ir para uma conta do tipo Dinheiro.', 409],
  CATEGORY_NOT_FOUND: ['A categoria não foi encontrada.', 404],
  IDEMPOTENCY_KEY_REUSED: ['Este envio já foi usado para outro lançamento. Abra o formulário de novo.', 409],
};

/** Dia civil local; hoje usa o instante atual para ficar depois do saldo informado hoje. */
function civilDate(value: string, now: Date): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date > today) return null;
  if (today.getTime() - date.getTime() > 366 * 86_400_000) return null;
  return date.getTime() === today.getTime() ? now : date;
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const parsed = manualSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_MANUAL_ENTRY', 'Confira o valor, a descrição e a data do lançamento.', 400);
  const occurredOn = civilDate(parsed.data.occurredOn, new Date());
  if (!occurredOn) return fail('INVALID_MANUAL_ENTRY_DATE', 'A data precisa ser de hoje ou de até um ano atrás.', 400);

  try {
    const result = await createManualEntry(guarded.profileId, {
      accountId: parsed.data.accountId,
      occurredOn,
      description: parsed.data.description,
      amountCents: BigInt(parsed.data.amountCents),
      categoryId: parsed.data.categoryId ?? null,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    // Reenvio do mesmo pedido devolve o mesmo lançamento, com 200 em vez de 201.
    return ok({ transactionId: result.transactionId, timelineEventId: result.timelineEventId, created: result.created }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof ManualEntryError) {
      const [message, status] = MANUAL_ERRORS[error.code] ?? ['O lançamento não pôde ser registrado.', 409];
      return fail(error.code, message, status);
    }
    return prismaFailure(error);
  }
}
