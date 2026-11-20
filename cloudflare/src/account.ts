import { type Ctx, isModerator, requireSession } from './context.ts';
import type { Env } from './env.ts';
import { now } from './lib/crypto.ts';
import { auditEvent, record, securityEvent } from './lib/events.ts';
import { body, deny, json } from './lib/http.ts';
import { BUCKETS, limit } from './lib/limits.ts';
import { boundedText, opaqueId } from './lib/text.ts';

/* Conta: perfil público, sessões e exclusão (MVP 1, docs/PRODUCT.md). */

export async function userPayload(e: Env, userId: string) {
  const row = await e.DB.prepare('SELECT p.id profile_id,p.public_name,u.created_at FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE u.id=?')
    .bind(userId)
    .first<{ profile_id: string; public_name: string; created_at: string }>();
  if (!row) return deny('AUTH_REQUIRED', 401);
  return { profileId: row.profile_id, publicName: row.public_name, isModerator: await isModerator(e, userId), memberSince: row.created_at };
}

/** GET /api/me */
export async function me(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.privateUser, session.user_id);
  return json({ user: await userPayload(ctx.e, session.user_id) });
}

/** PATCH /api/me {publicName} */
export async function updateMe(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.editUser, session.user_id);
  const x = await body<{ publicName?: unknown }>(ctx.r);
  const publicName = boundedText(x.publicName, 2, 40, 'INVALID_PUBLIC_NAME', false);
  await ctx.e.DB.prepare('UPDATE user_profiles SET public_name=?,updated_at=? WHERE user_id=?').bind(publicName, now(), session.user_id).run();
  return json({ user: await userPayload(ctx.e, session.user_id) });
}

/**
 * DELETE /api/me {confirm:'EXCLUIR'}
 *
 * Encerra todas as sessões e apaga identidade, perfil, aceites, concessões,
 * votos, verificação em duas etapas e chaves de idempotência. Publicações e
 * comentários viram lápide (texto apagado, relação preservada para as
 * respostas de outras pessoas). A linha de `users` fica como lápide sem e-mail,
 * porque publicações, denúncias e moderação a referenciam (ON DELETE RESTRICT).
 */
export async function deleteMe(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.accountDelete, session.user_id);
  const x = await body<{ confirm?: unknown }>(ctx.r);
  if (x.confirm !== 'EXCLUIR') deny('CONFIRMATION_REQUIRED', 400);
  const { e } = ctx;
  const id = session.user_id;
  const t = now();
  await e.DB.batch([
    e.DB.prepare("UPDATE feedback_posts SET status='DELETED',title='',body='',deleted_at=?,updated_at=? WHERE author_user_id=? AND status<>'DELETED'").bind(
      t,
      t,
      id,
    ),
    e.DB.prepare("UPDATE feedback_comments SET status='DELETED',body='',deleted_at=?,updated_at=? WHERE author_user_id=? AND status<>'DELETED'").bind(
      t,
      t,
      id,
    ),
    e.DB.prepare('DELETE FROM feedback_post_votes WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM feedback_comment_votes WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM download_grants WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM oauth_identities WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM user_profiles WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM consents WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM mfa_totp WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM mfa_recovery_reveals WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM mfa_challenges WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM desktop_auth_requests WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM idempotency_keys WHERE user_id=?').bind(id),
    e.DB.prepare('DELETE FROM user_roles WHERE user_id=?').bind(id),
    e.DB.prepare(
      "UPDATE users SET status='DELETED',email_normalized='deleted:'||id,email_verified_at=NULL,deleted_at=?,updated_at=? WHERE id=?",
    ).bind(t, t, id),
  ]);
  await record(
    securityEvent(e, 'ACCOUNT_DELETED', 'SUCCESS', 'MEDIUM', { userId: id }),
    auditEvent(e, 'ACCOUNT_DELETED', { type: 'user', id }, 'SUCCESS', id),
  );
  return json({ ok: true });
}

/** GET /api/me/sessions */
export async function sessions(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.privateUser, session.user_id);
  const rows = await ctx.e.DB.prepare(
    `SELECT s.id,s.created_at,s.last_seen_at,s.client_kind FROM auth_sessions s
     WHERE s.user_id=? AND s.revoked_at IS NULL AND EXISTS(
       SELECT 1 FROM refresh_token_families f JOIN refresh_tokens t ON t.family_id=f.id
       WHERE f.session_id=s.id AND f.revoked_at IS NULL AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>?)
     ORDER BY s.created_at DESC LIMIT 50`,
  )
    .bind(session.user_id, now())
    .all<{ id: string; created_at: string; last_seen_at: string | null; client_kind: string }>();
  return json({
    sessions: rows.results.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      clientKind: row.client_kind,
      current: row.id === session.id,
    })),
  });
}

/** DELETE /api/me/sessions/:sessionId: só sessões da própria pessoa. */
export async function revokeSession(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.privateUser, session.user_id);
  const target = opaqueId(ctx.params[0], 'SESSION_NOT_FOUND');
  const t = now();
  const result = await ctx.e.DB.prepare('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND user_id=?')
    .bind(t, target, session.user_id)
    .run();
  if (result.meta.changes !== 1) return deny('SESSION_NOT_FOUND', 404);
  await ctx.e.DB.prepare('UPDATE refresh_token_families SET revoked_at=COALESCE(revoked_at,?) WHERE session_id=?').bind(t, target).run();
  await record(securityEvent(ctx.e, 'SESSION_REVOKED', 'SUCCESS', 'LOW', { userId: session.user_id, sessionId: target }));
  return json({ ok: true });
}
