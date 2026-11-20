import { type Ctx, requireSession } from '../context.ts';
import type { Env } from '../env.ts';
import { now, open, seal, th } from '../lib/crypto.ts';
import { record, securityEvent } from '../lib/events.ts';
import { body, deny, json } from '../lib/http.ts';
import { BUCKETS, limit } from '../lib/limits.ts';
import { base32Decode, base32Encode, matchingStep, otpauthUri } from './totp.ts';

/* Verificação em duas etapas por app autenticador (TOTP).

   - O segredo é gerado no Worker (20 bytes, CSPRNG) e guardado cifrado com
     AES-GCM sob MFA_ENCRYPTION_KEY, com o ID da pessoa como dado associado:
     um texto cifrado copiado para outra conta não abre.
   - A ativação exige o primeiro código válido.
   - 10 códigos de recuperação de uso único, guardados só como hash; exibidos
     uma vez (cópia cifrada por 10 minutos, apagada ao exibir).
   - Repetir um código no mesmo passo é recusado (`last_used_step`).
   - Falhas consecutivas por conta abrem bloqueio crescente: 5 erros = 5 min,
     dobrando a cada 5 erros seguintes, até 1 hora. Por IP, o balde `mfa-ip`. */

// Exatamente 32 símbolos: `byte & 0x1f` escolhe cada um com a mesma chance.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_COUNT = 10;
const PENDING_WINDOW_MS = 15 * 60_000;
const REVEAL_WINDOW_MS = 10 * 60_000;

function keyMaterial(e: Env): string {
  const key = e.MFA_ENCRYPTION_KEY?.trim();
  if (!key || key.length < 32) return deny('MFA_UNAVAILABLE', 503);
  return `mfa:${key}`;
}

function recoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b & 0x1f]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

const recoveryHash = (e: Env, userId: string, code: string) => th(e, `recovery:${userId}:${code.toUpperCase()}`);

type TotpRow = {
  id: string;
  secret_ciphertext: string;
  status: 'PENDING' | 'ACTIVE';
  last_used_step: number;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
};

const totpRow = (e: Env, userId: string) =>
  e.DB.prepare('SELECT id,secret_ciphertext,status,last_used_step,failed_attempts,locked_until,created_at FROM mfa_totp WHERE user_id=?')
    .bind(userId)
    .first<TotpRow>();

/** Registra uma falha e, a cada 5, abre o bloqueio crescente. */
async function registerFailure(e: Env, userId: string, row: TotpRow) {
  const failures = row.failed_attempts + 1;
  const lockMinutes = failures % 5 === 0 ? Math.min(60, 5 * 2 ** (failures / 5 - 1)) : 0;
  await e.DB.prepare('UPDATE mfa_totp SET failed_attempts=?,locked_until=?,updated_at=? WHERE id=?')
    .bind(failures, lockMinutes ? now(lockMinutes * 60_000) : row.locked_until, now(), row.id)
    .run();
  await record(securityEvent(e, 'MFA_VERIFY', 'FAILURE', 'MEDIUM', { userId }));
  if (lockMinutes) await record(securityEvent(e, 'MFA_LOCKOUT', 'BLOCKED', 'HIGH', { userId, metadata: { reason: `${lockMinutes}min` } }));
}

/**
 * Confere um código TOTP (ou de recuperação) da pessoa, aplicando bloqueio e
 * antirrepetição. `allowPending` só na ativação.
 */
export async function verifyMfa(
  e: Env,
  userId: string,
  input: { code?: unknown; recoveryCode?: unknown },
  allowPending = false,
): Promise<boolean> {
  const material = keyMaterial(e);
  const row = await totpRow(e, userId);
  if (!row || (row.status !== 'ACTIVE' && !allowPending)) return false;
  if (row.locked_until && Date.parse(row.locked_until) > Date.now()) {
    await record(securityEvent(e, 'MFA_VERIFY', 'BLOCKED', 'MEDIUM', { userId, metadata: { reason: 'locked' } }));
    return deny('MFA_LOCKED', 429);
  }
  let ok = false;
  if (typeof input.recoveryCode === 'string' && row.status === 'ACTIVE') {
    const code = input.recoveryCode.trim().toUpperCase();
    if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
      const used = await e.DB.prepare('UPDATE mfa_recovery_codes SET consumed_at=? WHERE user_id=? AND code_hash=? AND consumed_at IS NULL')
        .bind(now(), userId, await recoveryHash(e, userId, code))
        .run();
      ok = used.meta.changes === 1;
      if (ok) await record(securityEvent(e, 'MFA_RECOVERY_CODE_USED', 'SUCCESS', 'MEDIUM', { userId }));
    }
  } else if (typeof input.code === 'string') {
    const secret = base32Decode(await open(material, row.secret_ciphertext, userId));
    const step = await matchingStep(secret, input.code.trim(), Math.floor(Date.now() / 1000), row.last_used_step);
    if (step !== null) {
      // Passo gravado atomicamente: dois envios do mesmo código não passam os dois.
      const claimed = await e.DB.prepare('UPDATE mfa_totp SET last_used_step=?,updated_at=? WHERE id=? AND last_used_step<?')
        .bind(step, now(), row.id, step)
        .run();
      ok = claimed.meta.changes === 1;
    }
  }
  if (!ok) {
    await registerFailure(e, userId, row);
    return false;
  }
  await e.DB.prepare('UPDATE mfa_totp SET failed_attempts=0,locked_until=NULL WHERE id=?').bind(row.id).run();
  return true;
}

/** Gera códigos novos (substitui os anteriores) e guarda a cópia de exibição única. */
async function regenerateRecoveryCodes(e: Env, userId: string) {
  const material = keyMaterial(e);
  const codes = Array.from({ length: RECOVERY_COUNT }, recoveryCode);
  const t = now();
  await e.DB.batch([
    e.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').bind(userId),
    ...(await Promise.all(
      codes.map(async (code) =>
        e.DB.prepare('INSERT INTO mfa_recovery_codes(id,user_id,code_hash,created_at) VALUES(?,?,?,?)').bind(
          crypto.randomUUID(),
          userId,
          await recoveryHash(e, userId, code),
          t,
        ),
      ),
    )),
    e.DB.prepare(
      'INSERT INTO mfa_recovery_reveals(id,user_id,codes_ciphertext,expires_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET codes_ciphertext=excluded.codes_ciphertext,expires_at=excluded.expires_at,created_at=excluded.created_at',
    ).bind(crypto.randomUUID(), userId, await seal(material, JSON.stringify(codes), `reveal:${userId}`), now(REVEAL_WINDOW_MS), t),
  ]);
}

/** GET /api/me/mfa */
export async function status(ctx: Ctx) {
  const session = await requireSession(ctx);
  const row = await totpRow(ctx.e, session.user_id);
  const remaining = await ctx.e.DB.prepare('SELECT COUNT(*) n FROM mfa_recovery_codes WHERE user_id=? AND consumed_at IS NULL')
    .bind(session.user_id)
    .first<{ n: number }>();
  const reveal = await ctx.e.DB.prepare('SELECT 1 x FROM mfa_recovery_reveals WHERE user_id=? AND expires_at>?').bind(session.user_id, now()).first();
  return json({ totp: row?.status ?? 'NONE', recoveryCodesRemaining: remaining?.n ?? 0, recoveryCodesToReveal: reveal !== null });
}

/** POST /api/me/mfa/totp/enroll: cria (ou recria) o segredo pendente. */
export async function enroll(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.mfaManage, session.user_id);
  const material = keyMaterial(ctx.e);
  const existing = await totpRow(ctx.e, session.user_id);
  if (existing?.status === 'ACTIVE') deny('MFA_ALREADY_ACTIVE', 409);
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  const t = now();
  await ctx.e.DB.prepare(
    `INSERT INTO mfa_totp(id,user_id,secret_ciphertext,status,created_at,updated_at) VALUES(?,?,?,'PENDING',?,?)
     ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=excluded.secret_ciphertext,status='PENDING',last_used_step=0,
       failed_attempts=0,locked_until=NULL,created_at=excluded.created_at,updated_at=excluded.updated_at WHERE mfa_totp.status='PENDING'`,
  )
    .bind(crypto.randomUUID(), session.user_id, await seal(material, secret, session.user_id), t, t)
    .run();
  return json({ ok: true });
}

/** GET /api/me/mfa/totp/pending: o segredo só existe para exibição enquanto pendente. */
export async function pending(ctx: Ctx) {
  const session = await requireSession(ctx);
  const material = keyMaterial(ctx.e);
  const row = await totpRow(ctx.e, session.user_id);
  if (row?.status !== 'PENDING' || Date.now() - Date.parse(row.created_at) > PENDING_WINDOW_MS) return deny('MFA_NOT_PENDING', 404);
  const secret = await open(material, row.secret_ciphertext, session.user_id);
  const profile = await ctx.e.DB.prepare('SELECT public_name FROM user_profiles WHERE user_id=?').bind(session.user_id).first<{ public_name: string }>();
  // O rótulo usa o nome público, não o e-mail: o QR pode ser fotografado.
  return json({ secret, otpauthUri: otpauthUri(secret, profile?.public_name ?? 'conta') });
}

/** POST /api/me/mfa/totp/activate {code} */
export async function activate(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.mfaIp, ctx.ip);
  const x = await body<{ code?: unknown }>(ctx.r);
  const row = await totpRow(ctx.e, session.user_id);
  if (row?.status !== 'PENDING' || Date.now() - Date.parse(row.created_at) > PENDING_WINDOW_MS) return deny('MFA_NOT_PENDING', 404);
  if (!(await verifyMfa(ctx.e, session.user_id, { code: x.code }, true))) return deny('INVALID_MFA_CODE', 400);
  const activated = await ctx.e.DB.prepare("UPDATE mfa_totp SET status='ACTIVE',activated_at=?,updated_at=? WHERE id=? AND status='PENDING'")
    .bind(now(), now(), row.id)
    .run();
  if (activated.meta.changes !== 1) return deny('MFA_NOT_PENDING', 404);
  await regenerateRecoveryCodes(ctx.e, session.user_id);
  await record(securityEvent(ctx.e, 'MFA_ENROLLED', 'SUCCESS', 'MEDIUM', { userId: session.user_id, sessionId: session.id }));
  return json({ ok: true });
}

/** POST /api/me/mfa/recovery-codes/reveal: devolve os códigos uma única vez. */
export async function reveal(ctx: Ctx) {
  const session = await requireSession(ctx);
  const material = keyMaterial(ctx.e);
  const row = await ctx.e.DB.prepare('DELETE FROM mfa_recovery_reveals WHERE user_id=? AND expires_at>? RETURNING codes_ciphertext')
    .bind(session.user_id, now())
    .first<{ codes_ciphertext: string }>();
  if (!row) return deny('NOTHING_TO_REVEAL', 404);
  return json({ recoveryCodes: JSON.parse(await open(material, row.codes_ciphertext, `reveal:${session.user_id}`)) as string[] });
}

/** POST /api/me/mfa/recovery-codes {code}: gera novos códigos com um código atual. */
export async function regenerate(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.mfaIp, ctx.ip);
  const x = await body<{ code?: unknown }>(ctx.r);
  if (!(await verifyMfa(ctx.e, session.user_id, { code: x.code }))) return deny('INVALID_MFA_CODE', 400);
  await regenerateRecoveryCodes(ctx.e, session.user_id);
  await record(securityEvent(ctx.e, 'MFA_RECOVERY_CODES_REGENERATED', 'SUCCESS', 'MEDIUM', { userId: session.user_id, sessionId: session.id }));
  return json({ ok: true });
}

/** POST /api/me/mfa/totp/disable {code|recoveryCode}: exige um código atual. */
export async function disable(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.mfaIp, ctx.ip);
  const x = await body<{ code?: unknown; recoveryCode?: unknown }>(ctx.r);
  if (!(await verifyMfa(ctx.e, session.user_id, { code: x.code, recoveryCode: x.recoveryCode }))) return deny('INVALID_MFA_CODE', 400);
  await ctx.e.DB.batch([
    ctx.e.DB.prepare('DELETE FROM mfa_totp WHERE user_id=?').bind(session.user_id),
    ctx.e.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').bind(session.user_id),
    ctx.e.DB.prepare('DELETE FROM mfa_recovery_reveals WHERE user_id=?').bind(session.user_id),
  ]);
  await record(securityEvent(ctx.e, 'MFA_DISABLED', 'SUCCESS', 'HIGH', { userId: session.user_id, sessionId: session.id }));
  return json({ ok: true });
}
