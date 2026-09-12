import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';

/* Listagem de lançamentos.

   Feature 5 de docs/ROUTING_MVP.md. Filtros e ordenação são validados no
   backend; o cliente não envia nome de coluna nem cláusula de ordenação
   (docs/ESTRUTURA_DE_DADOS.md, §9). A paginação é por cursor opaco, não por
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
