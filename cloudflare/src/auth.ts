import { type Ctx, requireSession } from './context.ts';
import {
  ACCESS_TTL_SECONDS,
  DESKTOP_CODE_TTL_SECONDS,
  DESKTOP_REQUEST_TTL_SECONDS,
  type Env,
  LEGAL_VERSIONS,
  MFA_CHALLENGE_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from './env.ts';
import { userPayload } from './account.ts';
import { now, open, rnd, s256, safeEqual, seal, th } from './lib/crypto.ts';
import { record, securityEvent } from './lib/events.ts';
import { body, deny, json } from './lib/http.ts';
import { BUCKETS, limit } from './lib/limits.ts';
import { requireTurnstile } from './lib/turnstile.ts';
import { verifyMfa } from './mfa/routes.ts';

/* Login com Google (OIDC, Authorization Code + PKCE) para a LP e para o app
   desktop, a etapa de verificação em duas etapas e a emissão de sessões.
   Fluxos e contratos: docs/ARCHITECTURE.md §2.3 e §3.5. */

type ClientKind = 'WEB' | 'DESKTOP';
const enc = new TextEncoder();
const decodeJson = (x: string) =>
  JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));

type GoogleClaims = {
  iss: string;
  aud: string;
  exp: number;
  nonce: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
};

async function verifyIdToken(jwt: string, e: Env, nonce: string): Promise<GoogleClaims> {
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) throw new Error('JWT');
  const header = decodeJson(h) as { alg: string; kid: string };
  const claims = decodeJson(p) as GoogleClaims;
  if (header.alg !== 'RS256') throw new Error('ALG');
  const keys = (await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(5000) }).then((x) => x.json())) as {
    keys: (JsonWebKey & { kid?: string })[];
  };
  const jwk = keys.keys.find((x) => x.kid === header.kid);
  if (!jwk) throw new Error('KID');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const sig = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, enc.encode(`${h}.${p}`)))) throw new Error('SIG');
  if (
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    claims.aud !== e.GOOGLE_CLIENT_ID ||
    claims.exp * 1000 <= Date.now() ||
    claims.nonce !== nonce ||
    !claims.sub ||
    !claims.email ||
    !claims.email_verified
  )
    throw new Error('CLAIMS');
  return claims;
}

/** Aceite exigido no início de todo login: só as versões vigentes valem. */
function requireConsent(input: unknown) {
  const consent = input as { terms?: unknown; privacy?: unknown } | undefined;
  if (consent?.terms !== LEGAL_VERSIONS.terms || consent?.privacy !== LEGAL_VERSIONS.privacy) deny('CONSENT_REQUIRED', 400);
}

/** Cria a transação OAuth e devolve a URL do Google. O redirecionamento é sempre o callback fixo da LP. */
async function createAuthTransaction(e: Env, kind: ClientKind, desktopRequestId: string | null) {
  const state = rnd();
  const nonce = rnd();
  const verifier = rnd(48);
  const redirect = `${e.PUBLIC_WEB_URL}/api/auth/callback`;
  await e.DB.prepare(
    `INSERT INTO auth_transactions(id,state_hash,nonce_hash,code_verifier_ciphertext,redirect_uri,return_to,expires_at,created_at,
       consent_terms_version,consent_privacy_version,client_kind,desktop_request_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      crypto.randomUUID(),
      await th(e, state),
      await th(e, nonce),
      await seal(e.SESSION_SIGNING_SECRET, `${nonce}:${verifier}`),
      redirect,
      kind === 'WEB' ? '/downloads' : 'desktop',
      now(600_000),
      now(),
      LEGAL_VERSIONS.terms,
      LEGAL_VERSIONS.privacy,
      kind,
      desktopRequestId,
    )
    .run();
  const a = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for (const [k, v] of Object.entries({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: await s256(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }))
    a.searchParams.set(k, v);
  return a.toString();
}

/** POST /api/auth/start (BFF). Aceite + Turnstile; devolve a URL do Google. */
export async function start(ctx: Ctx) {
  await limit(ctx.e, BUCKETS.login, ctx.ip);
  const input = await body<{ consent?: unknown; turnstileToken?: unknown }>(ctx.r);
  requireConsent(input.consent);
  await requireTurnstile(ctx.e, input.turnstileToken, 'login', ctx.ip);
  return json({ authorizationUrl: await createAuthTransaction(ctx.e, 'WEB', null) });
}

/** Sessão opaca + família de refresh. Só hashes vão ao D1. */
export async function issueSession(e: Env, userId: string, kind: ClientKind) {
  const access = rnd();
  const refresh = rnd(48);
  const sid = crypto.randomUUID();
  const fid = crypto.randomUUID();
  const t = now();
  await e.DB.batch([
    e.DB.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,created_at,client_kind) VALUES(?,?,?,?,?,?)').bind(
      sid,
      userId,
      await th(e, access),
      now(ACCESS_TTL_SECONDS * 1000),
      t,
      kind,
    ),
    e.DB.prepare('INSERT INTO refresh_token_families(id,session_id,created_at) VALUES(?,?,?)').bind(fid, sid, t),
    e.DB.prepare('INSERT INTO refresh_tokens(id,family_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(
      crypto.randomUUID(),
      fid,
      await th(e, refresh),
      now(REFRESH_TTL_SECONDS * 1000),
      t,
    ),
  ]);
  await record(securityEvent(e, 'SESSION_CREATED', 'SUCCESS', 'LOW', { userId, sessionId: sid, metadata: { clientKind: kind } }));
  return { accessToken: access, accessExpiresInSeconds: ACCESS_TTL_SECONDS, refreshToken: refresh, refreshExpiresInSeconds: REFRESH_TTL_SECONDS };
}

/** Termina o login: sessão web, ou código de uso único devolvido ao loopback do desktop. */
export async function completeLogin(e: Env, userId: string, kind: ClientKind, desktopRequestId: string | null) {
  if (kind === 'WEB') return json(await issueSession(e, userId, 'WEB'));
  const code = rnd();
  const claimed = await e.DB.prepare(
    `UPDATE desktop_auth_requests SET user_id=?,code_hash=?,code_expires_at=?
     WHERE id=? AND code_hash IS NULL AND consumed_at IS NULL AND expires_at>?`,
  )
    .bind(userId, await th(e, code), now(DESKTOP_CODE_TTL_SECONDS * 1000), desktopRequestId, now())
    .run();
  if (claimed.meta.changes !== 1) deny('DESKTOP_REQUEST_EXPIRED', 400);
  const request = await e.DB.prepare('SELECT redirect_uri,desktop_state FROM desktop_auth_requests WHERE id=?')
    .bind(desktopRequestId)
    .first<{ redirect_uri: string; desktop_state: string }>();
  if (!request) return deny('DESKTOP_REQUEST_EXPIRED', 400);
  const target = new URL(request.redirect_uri);
  target.searchParams.set('code', code);
  target.searchParams.set('state', request.desktop_state);
  return json({ desktopRedirect: target.toString() });
}

/** POST /api/auth/callback (BFF). Troca o código, valida o ID token, cria a conta e o aceite. */
export async function callback(ctx: Ctx) {
  const { e } = ctx;
  await limit(e, BUCKETS.callback, ctx.ip);
  const x = await body<{ code?: unknown; state?: unknown }>(ctx.r);
  if (typeof x.code !== 'string' || typeof x.state !== 'string' || x.code.length > 2048 || x.state.length > 256) deny('INVALID_CALLBACK', 400);
  const tx = await e.DB.prepare(
    `SELECT id,code_verifier_ciphertext,redirect_uri,consent_terms_version,consent_privacy_version,client_kind,desktop_request_id
     FROM auth_transactions WHERE state_hash=? AND consumed_at IS NULL AND expires_at>?`,
  )
    .bind(await th(e, x.state as string), now())
    .first<{
      id: string;
      code_verifier_ciphertext: string;
      redirect_uri: string;
      consent_terms_version: string | null;
      consent_privacy_version: string | null;
      client_kind: ClientKind;
      desktop_request_id: string | null;
    }>();
  if (!tx) return deny('INVALID_AUTH_TRANSACTION', 400);
  const used = await e.DB.prepare('UPDATE auth_transactions SET consumed_at=? WHERE id=? AND consumed_at IS NULL').bind(now(), tx.id).run();
  if (used.meta.changes !== 1) deny('INVALID_AUTH_TRANSACTION', 400);
  const [nonce, verifier] = (await open(e.SESSION_SIGNING_SECRET, tx.code_verifier_ciphertext)).split(':');
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: x.code as string,
      client_id: e.GOOGLE_CLIENT_ID,
      client_secret: e.GOOGLE_CLIENT_SECRET,
      redirect_uri: tx.redirect_uri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!tr?.ok) return deny('OAUTH_EXCHANGE_FAILED', 401);
  const idToken = ((await tr.json()) as { id_token?: string }).id_token;
  if (!idToken) return deny('OAUTH_EXCHANGE_FAILED', 401);
  let claims: GoogleClaims;
  try {
    claims = await verifyIdToken(idToken, e, nonce);
  } catch {
    await record(securityEvent(e, 'LOGIN', 'FAILURE', 'MEDIUM', { metadata: { reason: 'id_token', clientKind: tx.client_kind } }));
    return deny('INVALID_ID_TOKEN', 401);
  }
  const email = claims.email.toLowerCase();
  const t = now();
  // O nome público nasce do primeiro nome, não do nome completo: ele aparece na
  // comunidade, e a pessoa pode trocá-lo em Minha conta.
  const publicName = (claims.given_name || claims.name || 'Pessoa usuária').slice(0, 40);
  await e.DB.batch([
    e.DB.prepare(
      "INSERT INTO users(id,email_normalized,status,email_verified_at,created_at,updated_at) VALUES(?,?,'ACTIVE',?,?,?) ON CONFLICT(email_normalized) DO UPDATE SET email_verified_at=excluded.email_verified_at,updated_at=excluded.updated_at",
    ).bind(crypto.randomUUID(), email, t, t, t),
    e.DB.prepare(
      "INSERT INTO oauth_identities(id,user_id,provider,provider_subject,created_at,updated_at) SELECT ?,id,'GOOGLE',?,?,? FROM users WHERE email_normalized=? ON CONFLICT(provider,provider_subject) DO UPDATE SET updated_at=excluded.updated_at",
    ).bind(crypto.randomUUID(), claims.sub, t, t, email),
    e.DB.prepare(
      'INSERT INTO user_profiles(id,user_id,public_name,avatar_url,created_at,updated_at) SELECT ?,id,?,?,?,? FROM users WHERE email_normalized=? ON CONFLICT(user_id) DO NOTHING',
    ).bind(crypto.randomUUID(), publicName, claims.picture ?? null, t, t, email),
  ]);
  const user = await e.DB.prepare('SELECT id,status FROM users WHERE email_normalized=?').bind(email).first<{ id: string; status: string }>();
  if (!user) return deny('AUTH_FAILED', 500);
  if (user.status !== 'ACTIVE') {
    await record(securityEvent(e, 'LOGIN', 'BLOCKED', 'MEDIUM', { userId: user.id, metadata: { reason: 'status' } }));
    return deny('ACCOUNT_BLOCKED', 403);
  }
  // Aceite registrado no cadastro e a cada nova versão; repetir a mesma versão não duplica.
  if (tx.consent_terms_version && tx.consent_privacy_version) {
    await e.DB.batch(
      (
        [
          ['TERMS', tx.consent_terms_version],
          ['PRIVACY', tx.consent_privacy_version],
        ] as const
      ).map(([type, version]) =>
        e.DB.prepare(
          'INSERT INTO consents(id,user_id,document_type,document_version,accepted_at,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,document_type,document_version) DO NOTHING',
        ).bind(crypto.randomUUID(), user.id, type, version, t, t),
      ),
    );
  }
  const mfa = await e.DB.prepare("SELECT 1 active FROM mfa_totp WHERE user_id=? AND status='ACTIVE'").bind(user.id).first();
  if (mfa) {
    const token = rnd();
    await e.DB.prepare(
      'INSERT INTO mfa_challenges(id,challenge_hash,user_id,client_kind,desktop_request_id,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',
    )
      .bind(crypto.randomUUID(), await th(e, token), user.id, tx.client_kind, tx.desktop_request_id, now(MFA_CHALLENGE_TTL_SECONDS * 1000), t)
      .run();
    await record(securityEvent(e, 'LOGIN', 'SUCCESS', 'LOW', { userId: user.id, metadata: { clientKind: tx.client_kind, method: 'mfa_pending' } }));
    return json({ mfaRequired: true, mfaToken: token, expiresInSeconds: MFA_CHALLENGE_TTL_SECONDS });
  }
  await record(securityEvent(e, 'LOGIN', 'SUCCESS', 'LOW', { userId: user.id, metadata: { clientKind: tx.client_kind } }));
  return completeLogin(e, user.id, tx.client_kind, tx.desktop_request_id);
}

/** POST /api/auth/mfa/verify (BFF). Consome o estado pendente e só então emite a sessão. */
export async function mfaVerify(ctx: Ctx) {
  const { e } = ctx;
  await limit(e, BUCKETS.mfaIp, ctx.ip);
  const x = await body<{ mfaToken?: unknown; code?: unknown; recoveryCode?: unknown }>(ctx.r);
  if (typeof x.mfaToken !== 'string' || x.mfaToken.length > 128) return deny('MFA_CHALLENGE_EXPIRED', 400);
  const challenge = await e.DB.prepare(
    'SELECT id,user_id,client_kind,desktop_request_id,attempts FROM mfa_challenges WHERE challenge_hash=? AND consumed_at IS NULL AND expires_at>?',
  )
    .bind(await th(e, x.mfaToken), now())
    .first<{ id: string; user_id: string; client_kind: ClientKind; desktop_request_id: string | null; attempts: number }>();
  if (!challenge || challenge.attempts >= 5) return deny('MFA_CHALLENGE_EXPIRED', 400);
  const ok = await verifyMfa(e, challenge.user_id, { code: x.code, recoveryCode: x.recoveryCode });
  if (!ok) {
    // Cinco erros no mesmo desafio encerram o desafio: é preciso entrar de novo.
    await e.DB.prepare('UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=?').bind(challenge.id).run();
    return deny('INVALID_MFA_CODE', 400);
  }
  const claimed = await e.DB.prepare('UPDATE mfa_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL').bind(now(), challenge.id).run();
  if (claimed.meta.changes !== 1) return deny('MFA_CHALLENGE_EXPIRED', 400);
  return completeLogin(e, challenge.user_id, challenge.client_kind, challenge.desktop_request_id);
}

/** Revoga família e sessão e registra a reutilização. */
async function revokeFamily(e: Env, familyId: string, sessionId: string, userId: string | null, reason: string) {
  await e.DB.batch([
    e.DB.prepare('UPDATE refresh_token_families SET revoked_at=?,compromise_detected_at=? WHERE id=?').bind(now(), now(), familyId),
    e.DB.prepare('UPDATE auth_sessions SET revoked_at=? WHERE id=?').bind(now(), sessionId),
  ]);
  await record(securityEvent(e, 'REFRESH_REUSE', 'BLOCKED', 'HIGH', { userId, sessionId, metadata: { reason } }));
}

/** Rotação do refresh token, restrita ao tipo de cliente que o recebeu. */
export async function rotate(e: Env, refreshToken: unknown, kind: ClientKind) {
  if (typeof refreshToken !== 'string' || refreshToken.length > 128) return deny('INVALID_REFRESH', 401);
  const old = await e.DB.prepare(
    `SELECT rt.id,rt.family_id,rt.consumed_at,rt.expires_at,rf.session_id,s.user_id,s.client_kind FROM refresh_tokens rt
     JOIN refresh_token_families rf ON rf.id=rt.family_id JOIN auth_sessions s ON s.id=rf.session_id
     JOIN users u ON u.id=s.user_id
     WHERE rt.token_hash=? AND rt.revoked_at IS NULL AND rf.revoked_at IS NULL AND s.revoked_at IS NULL AND u.status='ACTIVE'`,
  )
    .bind(await th(e, refreshToken))
    .first<{
      id: string;
      family_id: string;
      consumed_at: string | null;
      expires_at: string;
      session_id: string;
      user_id: string;
      client_kind: ClientKind;
    }>();
  if (!old || Date.parse(old.expires_at) <= Date.now() || old.client_kind !== kind) return deny('INVALID_REFRESH', 401);
  if (old.consumed_at) {
    await revokeFamily(e, old.family_id, old.session_id, old.user_id, 'reuse');
    return deny('REFRESH_REUSE_DETECTED', 401);
  }
  const access = rnd();
  const refresh = rnd(48);
  const nid = crypto.randomUUID();
  const t = now();
  const claim = await e.DB.prepare('UPDATE refresh_tokens SET consumed_at=? WHERE id=? AND consumed_at IS NULL').bind(t, old.id).run();
  if (claim.meta.changes !== 1) {
    await revokeFamily(e, old.family_id, old.session_id, old.user_id, 'race');
    return deny('REFRESH_REUSE_DETECTED', 401);
  }
  await e.DB.batch([
    e.DB.prepare('INSERT INTO refresh_tokens(id,family_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').bind(
      nid,
      old.family_id,
      await th(e, refresh),
      now(REFRESH_TTL_SECONDS * 1000),
      t,
    ),
    e.DB.prepare('UPDATE refresh_tokens SET successor_token_id=? WHERE id=?').bind(nid, old.id),
    e.DB.prepare('UPDATE auth_sessions SET token_hash=?,expires_at=?,last_seen_at=? WHERE id=?').bind(
      await th(e, access),
      now(ACCESS_TTL_SECONDS * 1000),
      t,
      old.session_id,
    ),
  ]);
  return json({ accessToken: access, accessExpiresInSeconds: ACCESS_TTL_SECONDS, refreshToken: refresh, refreshExpiresInSeconds: REFRESH_TTL_SECONDS });
}

export async function refresh(ctx: Ctx) {
  await limit(ctx.e, BUCKETS.refresh, ctx.ip);
  const x = await body<{ refreshToken?: unknown }>(ctx.r);
  return rotate(ctx.e, x.refreshToken, 'WEB');
}

/**
 * Encerra a sessão pelo access token OU pelo refresh token. O refresh basta:
 * com o access token já expirado, a família continuava válida no D1 até
 * expirar (docs/SECURITY.md, Open items, item 3). Responde `ok` mesmo sem
 * nada a revogar, para não revelar se o token existia.
 */
export async function revokeByTokens(e: Env, access: string | null, refreshToken: unknown, kind: ClientKind) {
  const sessions = new Set<string>();
  if (access) {
    const row = await e.DB.prepare('SELECT id FROM auth_sessions WHERE token_hash=? AND client_kind=?').bind(await th(e, access), kind).first<{ id: string }>();
    if (row) sessions.add(row.id);
  }
  if (typeof refreshToken === 'string' && refreshToken.length <= 128) {
    const row = await e.DB.prepare(
      `SELECT rf.session_id FROM refresh_tokens rt JOIN refresh_token_families rf ON rf.id=rt.family_id
       JOIN auth_sessions s ON s.id=rf.session_id WHERE rt.token_hash=? AND s.client_kind=?`,
    )
      .bind(await th(e, refreshToken), kind)
      .first<{ session_id: string }>();
    if (row) sessions.add(row.session_id);
  }
  for (const id of sessions) {
    const t = now();
    await e.DB.batch([
      e.DB.prepare('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(t, id),
      e.DB.prepare('UPDATE refresh_token_families SET revoked_at=COALESCE(revoked_at,?) WHERE session_id=?').bind(t, id),
    ]);
    await record(securityEvent(e, 'LOGOUT', 'SUCCESS', 'LOW', { sessionId: id, metadata: { clientKind: kind } }));
  }
  return json({ ok: true });
}

export async function logout(ctx: Ctx) {
  await limit(ctx.e, BUCKETS.logout, ctx.ip);
  const x = await body<{ refreshToken?: unknown }>(ctx.r);
  const access = ctx.r.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{16,128})$/)?.[1] ?? null;
  return revokeByTokens(ctx.e, access, x.refreshToken, 'WEB');
}

/* --- App desktop: cliente público nativo (RFC 8252) ----------------------

   Opção escolhida: o Worker continua sendo o único cliente OAuth do Google e
   o callback continua sendo o da LP; o app recebe, no seu loopback, um código
   de uso único do Talentum, trocado com o PKCE do próprio app. Assim nenhum
   segredo do Google vai para o instalador e o redirecionamento registrado no
   Google não muda. */

/** Loopback de IP literal, porta explícita e caminho fixo (RFC 8252 §7.3 e §8.3). */
export function isLoopbackRedirect(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const port = Number(url.port);
  return (
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === '[::1]') &&
    Number.isInteger(port) &&
    port >= 1024 &&
    port <= 65535 &&
    url.pathname === '/callback' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === '' &&
    value === `http://${url.hostname}:${port}/callback`
  );
}

/** POST /api/desktop/auth/start (público). */
export async function desktopStart(ctx: Ctx) {
  const { e } = ctx;
  await limit(e, BUCKETS.desktopStart, ctx.ip);
  const x = await body<{ redirectUri?: unknown; codeChallenge?: unknown; codeChallengeMethod?: unknown; state?: unknown; consent?: unknown }>(ctx.r);
  if (!isLoopbackRedirect(x.redirectUri)) deny('INVALID_REDIRECT_URI', 400);
  if (x.codeChallengeMethod !== 'S256' || typeof x.codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(x.codeChallenge))
    deny('INVALID_CODE_CHALLENGE', 400);
  if (typeof x.state !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(x.state)) deny('INVALID_STATE', 400);
  requireConsent(x.consent);
  const handoff = rnd();
  await e.DB.prepare(
    'INSERT INTO desktop_auth_requests(id,redirect_uri,code_challenge,desktop_state,handoff_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',
  )
    .bind(crypto.randomUUID(), x.redirectUri, x.codeChallenge, x.state, await th(e, handoff), now(DESKTOP_REQUEST_TTL_SECONDS * 1000), now())
    .run();
  // O app abre esta página da LP no navegador do sistema; o BFF troca o valor
  // pela URL do Google e grava o cookie que amarra o `state` ao navegador.
  const signInUrl = `${e.PUBLIC_WEB_URL}/api/auth/desktop?handoff=${encodeURIComponent(handoff)}`;
  return json({ signInUrl, expiresInSeconds: DESKTOP_REQUEST_TTL_SECONDS });
}

/** POST /api/auth/desktop/handoff (BFF). Consome o valor de uso único e cria a transação OAuth do desktop. */
export async function desktopHandoff(ctx: Ctx) {
  const { e } = ctx;
  await limit(e, BUCKETS.login, ctx.ip);
  const x = await body<{ handoff?: unknown }>(ctx.r);
  if (typeof x.handoff !== 'string' || x.handoff.length > 128) return deny('DESKTOP_REQUEST_EXPIRED', 400);
  const row = await e.DB.prepare('SELECT id FROM desktop_auth_requests WHERE handoff_hash=?').bind(await th(e, x.handoff)).first<{ id: string }>();
  const claimed = row
    ? await e.DB.prepare('UPDATE desktop_auth_requests SET handoff_consumed_at=? WHERE id=? AND handoff_consumed_at IS NULL AND expires_at>?')
        .bind(now(), row.id, now())
        .run()
    : null;
  if (!row || claimed?.meta.changes !== 1) return deny('DESKTOP_REQUEST_EXPIRED', 400);
  return json({ authorizationUrl: await createAuthTransaction(e, 'DESKTOP', row.id) });
}

/** POST /api/desktop/auth/token (público). Troca o código do loopback pela sessão do desktop. */
export async function desktopToken(ctx: Ctx) {
  const { e } = ctx;
  await limit(e, BUCKETS.desktopToken, ctx.ip);
  const x = await body<{ code?: unknown; codeVerifier?: unknown; redirectUri?: unknown }>(ctx.r);
  if (typeof x.code !== 'string' || x.code.length > 128) return deny('INVALID_GRANT', 400);
  if (typeof x.codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(x.codeVerifier)) return deny('INVALID_GRANT', 400);
  const request = await e.DB.prepare(
    'SELECT id,user_id,redirect_uri,code_challenge,code_expires_at FROM desktop_auth_requests WHERE code_hash=? AND consumed_at IS NULL',
  )
    .bind(await th(e, x.code))
    .first<{ id: string; user_id: string; redirect_uri: string; code_challenge: string; code_expires_at: string }>();
  if (!request) return deny('INVALID_GRANT', 400);
  // Qualquer tentativa consome o código: um verificador errado não ganha segunda chance.
  const claimed = await e.DB.prepare('UPDATE desktop_auth_requests SET consumed_at=? WHERE id=? AND consumed_at IS NULL').bind(now(), request.id).run();
  if (claimed.meta.changes !== 1) return deny('INVALID_GRANT', 400);
  const pkceOk = await safeEqual(await s256(x.codeVerifier), request.code_challenge);
  if (Date.parse(request.code_expires_at) <= Date.now() || x.redirectUri !== request.redirect_uri || !pkceOk) {
    await record(securityEvent(e, 'DESKTOP_TOKEN', 'FAILURE', 'MEDIUM', { userId: request.user_id, metadata: { reason: pkceOk ? 'binding' : 'pkce' } }));
    return deny('INVALID_GRANT', 400);
  }
  return json(await issueSession(e, request.user_id, 'DESKTOP'));
}

export async function desktopRefresh(ctx: Ctx) {
  await limit(ctx.e, BUCKETS.refresh, ctx.ip);
  const x = await body<{ refreshToken?: unknown }>(ctx.r);
  return rotate(ctx.e, x.refreshToken, 'DESKTOP');
}

export async function desktopLogout(ctx: Ctx) {
  await limit(ctx.e, BUCKETS.logout, ctx.ip);
  const x = await body<{ refreshToken?: unknown }>(ctx.r);
  const access = ctx.r.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{16,128})$/)?.[1] ?? null;
  return revokeByTokens(ctx.e, access, x.refreshToken, 'DESKTOP');
}

/** GET /api/desktop/me (público + Bearer de sessão do desktop). */
export async function desktopMe(ctx: Ctx) {
  const session = await requireSession(ctx, 'DESKTOP');
  await limit(ctx.e, BUCKETS.privateUser, session.user_id);
  return json({ user: await userPayload(ctx.e, session.user_id) });
}

