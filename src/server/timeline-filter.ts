/* Filtro da linha do tempo por domínio e período.

   O domínio agrupa tipos de evento como a pessoa pensa neles ("Importações",
   "Dados e backup"), e não como o código os grava. O período é um intervalo
   semiaberto [from, to): o cliente calcula as bordas no fuso de quem usa, e o
   backend só confere que são instantes válidos e em ordem.

   Sem imports de alias: o executor de testes do Node importa este módulo. */

import { z } from 'zod';

export const TIMELINE_DOMAINS = {
  imports: ['import'],
  transactions: ['transaction_edit', 'manual_entry', 'categorization'],
  planning: ['planning'],
  reconciliation: ['reconciliation'],
  data: ['restore_point', 'restore_scheduled', 'restore_cancelled', 'data_export', 'encrypted_backup'],
  progress: ['month_review'],
} as const satisfies Record<string, readonly string[]>;

export type TimelineDomain = keyof typeof TIMELINE_DOMAINS;

export const TIMELINE_KINDS = Object.values(TIMELINE_DOMAINS).flat() as string[];

/** Teto do intervalo pedido: cinco anos. Evita varredura sem fim com datas absurdas. */
const MAX_RANGE_MS = 5 * 366 * 24 * 60 * 60 * 1000;

export const PAGE_SIZE = 50;

const querySchema = z
  .object({
    kind: z.enum(TIMELINE_KINDS as [string, ...string[]]).optional(),
    domain: z.enum(Object.keys(TIMELINE_DOMAINS) as [TimelineDomain, ...TimelineDomain[]]).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    cursor: z.string().uuid().optional(),
  })
  .strict();

export type TimelineFilter = {
  kinds: string[] | null;
  from: Date | null;
  to: Date | null;
  cursor: string | null;
};

/** Valida a query string. Devolve `null` quando o filtro é inválido. */
export function parseTimelineQuery(params: URLSearchParams): TimelineFilter | null {
  // Um Map e depois `Object.fromEntries`: `__proto__`, `constructor` e afins
  // viram chaves próprias comuns, que o esquema estrito recusa como desconhecidas.
  const entries = new Map<string, string>();
  for (const [key, value] of params) {
    if (entries.has(key)) return null; // parâmetro repetido é ambíguo
    entries.set(key, value);
  }
  const raw = Object.fromEntries(entries);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return null;
  const { kind, domain, from, to, cursor } = parsed.data;

  let kinds: string[] | null = null;
  if (domain) kinds = [...TIMELINE_DOMAINS[domain]];
  if (kind) {
    if (kinds && !kinds.includes(kind)) return null;
    kinds = [kind];
  }

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && toDate && (fromDate >= toDate || toDate.getTime() - fromDate.getTime() > MAX_RANGE_MS)) return null;

  return { kinds, from: fromDate, to: toDate, cursor: cursor ?? null };
}

export function domainOf(kind: string): TimelineDomain | null {
  for (const [domain, kinds] of Object.entries(TIMELINE_DOMAINS)) if ((kinds as readonly string[]).includes(kind)) return domain as TimelineDomain;
  return null;
}
