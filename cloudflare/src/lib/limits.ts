import type { Env } from '../env.ts';
import { now, th } from './crypto.ts';
import { deny } from './http.ts';

/* Rate limit em janelas fixas no D1 (`rate_limit_windows`).

   A chave do balde é um hash com pimenta de nome + sujeito (IP ou usuário):
   o IP nunca é gravado em claro. A contagem é um único UPSERT com RETURNING,
   então requisições concorrentes não leem o mesmo valor antigo. */

export type Bucket = { name: string; max: number; windowSeconds: number };

export const BUCKETS = {
  codes: { name: 'codes', max: 60, windowSeconds: 60 },
  publicCodes: { name: 'public-codes', max: 60, windowSeconds: 60 },
  login: { name: 'login', max: 10, windowSeconds: 60 },
  callback: { name: 'callback', max: 10, windowSeconds: 60 },
  refresh: { name: 'refresh', max: 20, windowSeconds: 60 },
  logout: { name: 'logout', max: 20, windowSeconds: 60 },
  privateUser: { name: 'private-user', max: 120, windowSeconds: 60 },
  grantUser: { name: 'grant-user', max: 10, windowSeconds: 600 },
  accountDelete: { name: 'account-delete', max: 3, windowSeconds: 3600 },
  communityRead: { name: 'community-read', max: 120, windowSeconds: 60 },
  postUser: { name: 'post-user', max: 5, windowSeconds: 3600 },
  commentUser: { name: 'comment-user', max: 20, windowSeconds: 3600 },
  editUser: { name: 'edit-user', max: 30, windowSeconds: 3600 },
  voteUser: { name: 'vote-user', max: 60, windowSeconds: 3600 },
  reportUser: { name: 'report-user', max: 10, windowSeconds: 86_400 },
  moderation: { name: 'moderation', max: 120, windowSeconds: 3600 },
  news: { name: 'news', max: 60, windowSeconds: 60 },
  summaryIp: { name: 'summary-ip', max: 10, windowSeconds: 60 },
  summaryGlobal: { name: 'summary-global', max: 200, windowSeconds: 3600 },
  mfaIp: { name: 'mfa-ip', max: 20, windowSeconds: 600 },
  mfaManage: { name: 'mfa-manage', max: 10, windowSeconds: 600 },
  desktopStart: { name: 'desktop-start', max: 10, windowSeconds: 60 },
  desktopToken: { name: 'desktop-token', max: 20, windowSeconds: 60 },
} satisfies Record<string, Bucket>;

/**
 * IP de quem originou a requisição. `X-Talentum-Client-IP` só vale quando o BFF
 * se autenticou (`trustForwarded`); fora disso, o IP de borda da Cloudflare.
 */
export function clientIp(r: Request, trustForwarded: boolean): string {
  const forwarded = trustForwarded ? r.headers.get('X-Talentum-Client-IP') : null;
  return forwarded ?? r.headers.get('CF-Connecting-IP') ?? 'local';
}

/** Conta uma requisição no balde; devolve `false` quando o limite já foi atingido. */
export async function hit(e: Env, bucket: Bucket, subject: string): Promise<boolean> {
  const key = await th(e, `${bucket.name}:${subject}`);
  const t = now();
  const windowStart = now(-bucket.windowSeconds * 1000);
  const row = await e.DB.prepare(
    `INSERT INTO rate_limit_windows(id,bucket_hash,window_started_at,request_count,updated_at) VALUES(?,?,?,1,?)
     ON CONFLICT(bucket_hash) DO UPDATE SET
       request_count = CASE WHEN rate_limit_windows.window_started_at <= ? THEN 1 ELSE rate_limit_windows.request_count + 1 END,
       window_started_at = CASE WHEN rate_limit_windows.window_started_at <= ? THEN excluded.window_started_at ELSE rate_limit_windows.window_started_at END,
       updated_at = excluded.updated_at
     RETURNING request_count`,
  )
    .bind(crypto.randomUUID(), key, t, t, windowStart, windowStart)
    .first<{ request_count: number }>();
  return (row?.request_count ?? 1) <= bucket.max;
}

/** Como `hit`, mas encerra a rota com `429 RATE_LIMITED`. */
export async function limit(e: Env, bucket: Bucket, subject: string): Promise<void> {
  if (!(await hit(e, bucket, subject))) deny('RATE_LIMITED', 429);
}
