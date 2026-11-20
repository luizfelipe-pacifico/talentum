import * as account from './account.ts';
import * as auth from './auth.ts';
import * as community from './community.ts';
import type { Ctx } from './context.ts';
import type { Env } from './env.ts';
import { now, sha, rnd, th } from './lib/crypto.ts';
import { body, fail, foreignOrigin, HttpError, json, preflight, withCors } from './lib/http.ts';
import { BUCKETS, clientIp, limit } from './lib/limits.ts';
import { purge } from './maintenance.ts';
import * as mfa from './mfa/routes.ts';
import * as news from './news/routes.ts';
import * as releases from './releases.ts';

export type { Env } from './env.ts';

/* Worker da nuvem do Talentum. Contratos: docs/ARCHITECTURE.md §3.5.

   Ordem de toda requisição: preflight/CORS → origem → BFF ou rota pública →
   código de ação (método + caminho, uso único) → rota (sessão, autorização,
   rate limit, validação). Rotas públicas existem para o backend local do app
   desktop, que não tem o segredo do BFF: notícias e o login do desktop. */

type Handler = (ctx: Ctx) => Promise<Response>;
type Route = { method: string; pattern: RegExp; handler: Handler; public?: boolean };

const ID = '([A-Za-z0-9_-]{1,64})';
const p = (path: string) => new RegExp(`^${path.replaceAll(':id', ID)}$`);

const ROUTES: Route[] = [
  { method: 'POST', pattern: p('/api/auth/start'), handler: auth.start },
  { method: 'POST', pattern: p('/api/auth/callback'), handler: auth.callback },
  { method: 'POST', pattern: p('/api/auth/mfa/verify'), handler: auth.mfaVerify },
  { method: 'POST', pattern: p('/api/auth/refresh'), handler: auth.refresh },
  { method: 'POST', pattern: p('/api/auth/logout'), handler: auth.logout },
  { method: 'POST', pattern: p('/api/auth/desktop/handoff'), handler: auth.desktopHandoff },
  { method: 'GET', pattern: p('/api/me'), handler: account.me },
  { method: 'PATCH', pattern: p('/api/me'), handler: account.updateMe },
  { method: 'DELETE', pattern: p('/api/me'), handler: account.deleteMe },
  { method: 'GET', pattern: p('/api/me/sessions'), handler: account.sessions },
  { method: 'DELETE', pattern: p('/api/me/sessions/:id'), handler: account.revokeSession },
  { method: 'GET', pattern: p('/api/me/mfa'), handler: mfa.status },
  { method: 'POST', pattern: p('/api/me/mfa/totp/enroll'), handler: mfa.enroll },
  { method: 'GET', pattern: p('/api/me/mfa/totp/pending'), handler: mfa.pending },
  { method: 'POST', pattern: p('/api/me/mfa/totp/activate'), handler: mfa.activate },
  { method: 'POST', pattern: p('/api/me/mfa/totp/disable'), handler: mfa.disable },
  { method: 'POST', pattern: p('/api/me/mfa/recovery-codes'), handler: mfa.regenerate },
  { method: 'POST', pattern: p('/api/me/mfa/recovery-codes/reveal'), handler: mfa.reveal },
  { method: 'GET', pattern: p('/api/releases'), handler: releases.list },
  { method: 'POST', pattern: p('/api/releases/:id/download-grants'), handler: releases.createGrant },
  { method: 'POST', pattern: p('/api/download-grants/redeem'), handler: releases.redeemGrant },
  { method: 'GET', pattern: p('/api/feedback/posts'), handler: community.listPosts },
  { method: 'POST', pattern: p('/api/feedback/posts'), handler: community.createPost },
  { method: 'GET', pattern: p('/api/feedback/posts/:id'), handler: community.getPost },
  { method: 'PATCH', pattern: p('/api/feedback/posts/:id'), handler: community.updatePost },
  { method: 'DELETE', pattern: p('/api/feedback/posts/:id'), handler: community.deletePost },
  { method: 'POST', pattern: p('/api/feedback/posts/:id/comments'), handler: community.createComment },
  { method: 'PATCH', pattern: p('/api/feedback/comments/:id'), handler: community.updateComment },
  { method: 'DELETE', pattern: p('/api/feedback/comments/:id'), handler: community.deleteComment },
  { method: 'PUT', pattern: p('/api/feedback/posts/:id/vote'), handler: community.votePost },
  { method: 'DELETE', pattern: p('/api/feedback/posts/:id/vote'), handler: community.votePost },
  { method: 'PUT', pattern: p('/api/feedback/comments/:id/vote'), handler: community.voteComment },
  { method: 'DELETE', pattern: p('/api/feedback/comments/:id/vote'), handler: community.voteComment },
  { method: 'POST', pattern: p('/api/feedback/reports'), handler: community.report },
  { method: 'GET', pattern: p('/api/feedback/profiles/:id'), handler: community.profile },
  { method: 'GET', pattern: p('/api/feedback/moderation/reports'), handler: community.moderationQueue },
  { method: 'POST', pattern: p('/api/feedback/moderation/actions'), handler: community.moderate },
  // Públicas: aceitam código emitido por /api/public/action-codes (sem o segredo do BFF).
  { method: 'GET', pattern: p('/api/news'), handler: news.listNews, public: true },
  { method: 'GET', pattern: p('/api/news/:id'), handler: news.getNews, public: true },
  { method: 'POST', pattern: p('/api/news/:id/summary'), handler: news.summarize, public: true },
  { method: 'POST', pattern: p('/api/desktop/auth/start'), handler: auth.desktopStart, public: true },
  { method: 'POST', pattern: p('/api/desktop/auth/token'), handler: auth.desktopToken, public: true },
  { method: 'POST', pattern: p('/api/desktop/auth/refresh'), handler: auth.desktopRefresh, public: true },
  { method: 'POST', pattern: p('/api/desktop/auth/logout'), handler: auth.desktopLogout, public: true },
  { method: 'GET', pattern: p('/api/desktop/me'), handler: auth.desktopMe, public: true },
];

function match(method: string, path: string): { route: Route; params: string[] } | null {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const m = path.match(route.pattern);
    if (m) return { route, params: m.slice(1) };
  }
  return null;
}

async function isBff(r: Request, e: Env) {
  const v = r.headers.get('X-Talentum-BFF') ?? '';
  return v.length > 0 && (await sha(v)) === (await sha(e.BFF_SHARED_SECRET));
}

/** Contexto do código: o do BFF (hash do segredo) ou o público. Um não serve no outro. */
const contextHash = async (e: Env, viaBff: boolean) => (viaBff ? sha(e.BFF_SHARED_SECRET) : sha('talentum-public-action-code'));

async function issueCode(e: Env, viaBff: boolean, method: string, path: string) {
  const code = rnd();
  await e.DB.prepare('INSERT INTO action_codes(id,code_hash,method,path,context_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), await th(e, code), method, path, await contextHash(e, viaBff), now(60000), now())
    .run();
  return json({ actionCode: code, expiresInSeconds: 60 });
}

async function consumeCode(r: Request, e: Env, path: string, viaBff: boolean) {
  const v = r.headers.get('X-Action-Code');
  if (!v || v.length > 128) return false;
  const q = await e.DB.prepare(
    'UPDATE action_codes SET consumed_at=? WHERE code_hash=? AND method=? AND path=? AND context_hash=? AND consumed_at IS NULL AND expires_at>?',
  )
    .bind(now(), await th(e, v), r.method, path, await contextHash(e, viaBff), now())
    .run();
  return q.meta.changes === 1;
}

async function route(r: Request, e: Env): Promise<Response> {
  const url = new URL(r.url);
  const path = url.pathname;
  const pre = preflight(r, e);
  if (pre) return pre;
  if (r.method === 'GET' && path === '/health') {
    const x = await e.DB.prepare('SELECT 1 healthy').first<{ healthy: number }>();
    return json({ status: x?.healthy === 1 ? 'ok' : 'degraded', service: 'talentum-cloud-api' });
  }
  if (foreignOrigin(r, e)) return fail('ORIGIN_NOT_ALLOWED', 403);
  const viaBff = await isBff(r, e);
  const ip = clientIp(r, viaBff);

  if (r.method === 'POST' && path === '/api/action-codes') {
    if (!viaBff) return fail('BFF_REQUIRED', 403);
    await limit(e, BUCKETS.codes, ip);
    const x = await body<{ method?: unknown; path?: unknown }>(r);
    const method = typeof x.method === 'string' ? x.method : '';
    const target = typeof x.path === 'string' ? x.path : '';
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !target.startsWith('/api/') || target.length > 200 || !match(method, target))
      return fail('INVALID_ACTION_TARGET', 400);
    return issueCode(e, true, method, target);
  }
  if (r.method === 'POST' && path === '/api/public/action-codes') {
    await limit(e, BUCKETS.publicCodes, ip);
    const x = await body<{ method?: unknown; path?: unknown }>(r);
    const target = typeof x.path === 'string' && x.path.length <= 200 ? match(String(x.method), x.path) : null;
    if (!target?.route.public) return fail('INVALID_ACTION_TARGET', 400);
    return issueCode(e, false, String(x.method), x.path as string);
  }

  const found = match(r.method, path);
  if (!found) return viaBff ? fail('NOT_FOUND', 404) : fail('BFF_REQUIRED', 403);
  if (!found.route.public && !viaBff) return fail('BFF_REQUIRED', 403);
  if (!(await consumeCode(r, e, path, viaBff))) return fail('INVALID_ACTION_CODE', 403);
  return found.route.handler({ r, e, url, path, ip, viaBff, params: found.params });
}

export default {
  async fetch(r: Request, e: Env) {
    try {
      return withCors(r, e, await route(r, e));
    } catch (error) {
      if (error instanceof HttpError) return withCors(r, e, fail(error.code, error.status));
      return fail('INTERNAL_ERROR', 500);
    }
  },
  /* Cron (wrangler.jsonc, `triggers.crons`): retenção e busca de notícias. */
  async scheduled(_event: unknown, e: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(
      (async () => {
        await purge(e).catch(() => undefined);
        await news.ingestNews(e).catch(() => undefined);
      })(),
    );
  },
};

