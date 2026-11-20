import type { Env } from './env.ts';
import { now, th } from './lib/crypto.ts';
import { deny } from './lib/http.ts';

/* Contexto de uma requisição já autenticada na borda (BFF ou código público). */
export type Ctx = {
  r: Request;
  e: Env;
  url: URL;
  path: string;
  ip: string;
  viaBff: boolean;
  params: string[];
};

export type Session = { id: string; user_id: string; client_kind: 'WEB' | 'DESKTOP' };

/** Sessão do `Authorization: Bearer`, só de conta ativa; `null` sem token válido. */
export async function currentSession(ctx: Ctx): Promise<Session | null> {
  const token = ctx.r.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{16,128})$/)?.[1];
  if (!token) return null;
  return ctx.e.DB.prepare(
    `SELECT s.id,s.user_id,s.client_kind FROM auth_sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='ACTIVE'`,
  )
    .bind(await th(ctx.e, token), now())
    .first<Session>();
}

/** Sessão obrigatória; o tipo de cliente evita usar um token do desktop no BFF e vice-versa. */
export async function requireSession(ctx: Ctx, kind: 'WEB' | 'DESKTOP' = 'WEB'): Promise<Session> {
  const session = await currentSession(ctx);
  if (!session || session.client_kind !== kind) return deny('AUTH_REQUIRED', 401);
  return session;
}

export async function isModerator(e: Env, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const row = await e.DB.prepare("SELECT 1 ok FROM user_roles WHERE user_id=? AND role='MODERATOR'").bind(userId).first();
  return row !== null;
}
