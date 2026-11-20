import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { domainOf, PAGE_SIZE, parseTimelineQuery } from '@/server/timeline-filter';

/* Linha do tempo local (Feature 8, Stage 11).

   Filtros validados: `domain` (imports, transactions, reconciliation, data,
   progress) ou `kind`, período semiaberto `from`/`to` em ISO 8601 e cursor.
   A ordem é determinística, com o `id` como desempate, para a paginação não
   repetir nem pular eventos. */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const filter = parseTimelineQuery(new URL(request.url).searchParams);
  if (!filter) return fail('INVALID_TIMELINE_FILTER', 'O filtro informado é inválido.', 400);

  const createdAt = filter.from || filter.to ? { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } : undefined;
  const rows = await db.timelineEvent.findMany({
    where: { profileId:guarded.profileId, ...(filter.kinds ? { kind: { in: filter.kinds } } : {}), ...(createdAt ? { createdAt } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: { id: true, kind: true, title: true, description: true, reversible: true, revertedAt: true, createdAt: true },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const events = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((row) => ({
    ...row,
    domain: domainOf(row.kind),
    createdAt: row.createdAt.toISOString(),
    revertedAt: row.revertedAt?.toISOString() ?? null,
  }));
  return ok({ hasProfile: true, events, nextCursor: hasMore ? (events.at(-1)?.id ?? null) : null });
}
