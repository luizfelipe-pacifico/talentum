/* Cliente das notícias públicas do Worker (Etapas 15 e 16).

   Roda só no backend local. Pede um código de ação público ao Worker e faz a
   leitura com ele, como todo cliente do Worker faz (docs/ARCHITECTURE.md §2.8).

   O que sai deste computador: o método e o caminho pedidos e, na leitura, o
   código de ação. Nenhum dado do perfil, da carteira, de contas ou lançamentos
   é enviado, e nenhum cabeçalho além de `Content-Type` e `X-Action-Code`.
   A personalização, se um dia existir, acontece aqui, depois da resposta.

   Toda resposta é validada com esquema estrito antes de chegar à tela: o Worker
   é confiável, mas o caminho de rede até ele não é premissa de segurança.

   Sem import com `@/`: o módulo é testado diretamente pelo node:test. */

import { z } from 'zod';

const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
/** Teto do corpo aceito do Worker: a maior resposta legítima fica bem abaixo. */
const MAX_BODY_BYTES = 512 * 1024;

export const NEWS_ID = /^[A-Za-z0-9_-]{1,64}$/;

const httpsUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'https');

const isoDate = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'date');

const sourceSchema = z
  .object({
    key: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    homepage: httpsUrl,
    license: z.string().min(1).max(300),
  })
  .strict();

const itemSchema = z
  .object({
    id: z.string().regex(NEWS_ID),
    title: z.string().min(1).max(300),
    url: httpsUrl,
    excerpt: z.string().max(300),
    publishedAt: isoDate,
    source: sourceSchema,
  })
  .strict();

const listSchema = z.object({ items: z.array(itemSchema).max(50), updatedAt: isoDate.nullable() }).strict();
const itemResponseSchema = z.object({ item: itemSchema }).strict();
const summarySchema = z
  .object({
    summary: z
      .object({ text: z.string().min(1).max(700), method: z.enum(['AI', 'EXTRACT']), createdAt: isoDate })
      .strict(),
    item: itemSchema,
  })
  .strict();
const codeSchema = z.object({ actionCode: z.string().min(16).max(256), expiresInSeconds: z.number() }).strict();

export type NewsItem = z.infer<typeof itemSchema>;
export type NewsSummary = z.infer<typeof summarySchema>['summary'];

export type Unavailable = { status: 'unconfigured' } | { status: 'offline' };
export type NewsListResult = { status: 'ok'; items: NewsItem[]; updatedAt: string | null } | Unavailable;
export type NewsItemResult = { status: 'ok'; item: NewsItem } | { status: 'not_found' } | Unavailable;
export type NewsSummaryResult = { status: 'ok'; summary: NewsSummary; item: NewsItem } | { status: 'not_found' } | Unavailable;

/** Endereço do Worker sem barra final, ou `null` quando não configurado. */
export function cloudBaseUrl(value: string | undefined = process.env.TALENTUM_CLOUD_API_URL): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? trimmed : null;
  } catch {
    return null;
  }
}

type Fetch = typeof fetch;
type Options = { fetch?: Fetch; baseUrl?: string | null; now?: () => number };

class Offline extends Error {}
class NotFound extends Error {}

const cache = new Map<string, { expiresAt: number; value: unknown }>();

/** Limpa o cache em memória (testes). */
export function clearNewsCache() {
  cache.clear();
}

async function readBody(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new Offline();
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Offline();
  try {
    return JSON.parse(text);
  } catch {
    throw new Offline();
  }
}

async function request(base: string, method: 'GET' | 'POST', path: string, doFetch: Fetch): Promise<unknown> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let boot: Response;
  try {
    boot = await doFetch(`${base}/api/public/action-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, path }),
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
  } catch {
    throw new Offline();
  }
  if (!boot.ok) throw new Offline();
  const code = codeSchema.safeParse(await readBody(boot));
  if (!code.success) throw new Offline();

  let response: Response;
  try {
    response = await doFetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Action-Code': code.data.actionCode },
      body: method === 'POST' ? '{}' : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
  } catch {
    throw new Offline();
  }
  if (response.status === 404) throw new NotFound();
  if (!response.ok) throw new Offline();
  return readBody(response);
}

async function cached<T>(
  key: string,
  options: Options,
  load: (base: string, doFetch: Fetch) => Promise<T>,
): Promise<T | Unavailable | { status: 'not_found' }> {
  const base = options.baseUrl === undefined ? cloudBaseUrl() : options.baseUrl;
  if (!base) return { status: 'unconfigured' };
  const now = (options.now ?? Date.now)();
  const hit = cache.get(`${base}|${key}`);
  if (hit && hit.expiresAt > now) return hit.value as T;
  try {
    const value = await load(base, options.fetch ?? fetch);
    cache.set(`${base}|${key}`, { expiresAt: now + CACHE_TTL_MS, value });
    return value;
  } catch (error) {
    if (error instanceof NotFound) return { status: 'not_found' };
    return { status: 'offline' };
  }
}

export function listNews(options: Options = {}): Promise<NewsListResult> {
  return cached('list', options, async (base, doFetch) => {
    const parsed = listSchema.safeParse(await request(base, 'GET', '/api/news', doFetch));
    if (!parsed.success) throw new Offline();
    return { status: 'ok' as const, items: parsed.data.items, updatedAt: parsed.data.updatedAt };
  }) as Promise<NewsListResult>;
}

export function getNewsItem(newsId: string, options: Options = {}): Promise<NewsItemResult> {
  if (!NEWS_ID.test(newsId)) return Promise.resolve({ status: 'not_found' });
  return cached(`item:${newsId}`, options, async (base, doFetch) => {
    const parsed = itemResponseSchema.safeParse(await request(base, 'GET', `/api/news/${newsId}`, doFetch));
    if (!parsed.success || parsed.data.item.id !== newsId) throw new Offline();
    return { status: 'ok' as const, item: parsed.data.item };
  }) as Promise<NewsItemResult>;
}

export function summarizeNews(newsId: string, options: Options = {}): Promise<NewsSummaryResult> {
  if (!NEWS_ID.test(newsId)) return Promise.resolve({ status: 'not_found' });
  return cached(`summary:${newsId}`, options, async (base, doFetch) => {
    const parsed = summarySchema.safeParse(await request(base, 'POST', `/api/news/${newsId}/summary`, doFetch));
    if (!parsed.success || parsed.data.item.id !== newsId) throw new Offline();
    return { status: 'ok' as const, summary: parsed.data.summary, item: parsed.data.item };
  }) as Promise<NewsSummaryResult>;
}
