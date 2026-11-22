import { type Ctx, requireSession } from './context.ts';
import { DOWNLOAD_GRANT_TTL_SECONDS } from './env.ts';
import { now, rnd, th } from './lib/crypto.ts';
import { auditEvent, record } from './lib/events.ts';
import { body, deny, json } from './lib/http.ts';
import { BUCKETS, limit } from './lib/limits.ts';
import { opaqueId } from './lib/text.ts';

/* Releases e concessões de download (docs/SECURITY.md, Open items, item 8).

   A concessão é de uso único, vale 2 minutos e é validada pelo Worker antes de
   revelar o endereço do artefato: o BFF cria e resgata na mesma requisição, e
   o valor nunca passa pelo navegador. Como os releases de um repositório
   aberto são públicos, a concessão controla a experiência e a auditoria, não
   o sigilo do binário. */

const ARTIFACT_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

export function isAllowedArtifactUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ARTIFACT_HOSTS.has(url.hostname) && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

export async function list(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.privateUser, session.user_id);
  const q = await ctx.e.DB.prepare(
    "SELECT r.id,r.version,r.channel,a.id artifactId,a.platform,a.architecture,a.package_format packageFormat,a.sha256,a.signature FROM releases r JOIN release_artifacts a ON a.release_id=r.id WHERE r.status='PUBLISHED' AND a.package_format<>'UNKNOWN' ORDER BY r.published_at DESC",
  ).all();
  return json({ releases: q.results });
}

/** POST /api/releases/:releaseId/download-grants {artifactId} */
export async function createGrant(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.grantUser, session.user_id);
  const releaseId = opaqueId(ctx.params[0], 'RELEASE_NOT_FOUND');
  const x = await body<{ artifactId?: unknown }>(ctx.r);
  const artifactId = opaqueId(x.artifactId, 'RELEASE_NOT_FOUND');
  const a = await ctx.e.DB.prepare(
    "SELECT a.id,a.platform FROM release_artifacts a JOIN releases r ON r.id=a.release_id WHERE a.id=? AND r.id=? AND r.status='PUBLISHED'",
  )
    .bind(artifactId, releaseId)
    .first<{ id: string; platform: string }>();
  if (!a) return deny('RELEASE_NOT_FOUND', 404);
  const grant = rnd();
  const grantId = crypto.randomUUID();
  await ctx.e.DB.prepare('INSERT INTO download_grants(id,user_id,artifact_id,grant_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)')
    .bind(grantId, session.user_id, a.id, await th(ctx.e, grant), now(DOWNLOAD_GRANT_TTL_SECONDS * 1000), now())
    .run();
  await record(auditEvent(ctx.e, 'DOWNLOAD_GRANT_CREATED', { type: 'download_grant', id: grantId }, 'SUCCESS', session.user_id, { platform: a.platform }));
  return json({ grant, expiresInSeconds: DOWNLOAD_GRANT_TTL_SECONDS });
}

/** POST /api/download-grants/redeem {grant}: consome a concessão e só então revela o endereço. */
export async function redeemGrant(ctx: Ctx) {
  const session = await requireSession(ctx);
  await limit(ctx.e, BUCKETS.grantUser, session.user_id);
  const x = await body<{ grant?: unknown }>(ctx.r);
  if (typeof x.grant !== 'string' || x.grant.length > 128) return deny('GRANT_INVALID', 410);
  const grantHash = await th(ctx.e, x.grant);
  const row = await ctx.e.DB.prepare(
    'SELECT g.id,a.download_url,a.platform FROM download_grants g JOIN release_artifacts a ON a.id=g.artifact_id WHERE g.grant_hash=? AND g.user_id=?',
  )
    .bind(grantHash, session.user_id)
    .first<{ id: string; download_url: string; platform: string }>();
  const claimed = row
    ? await ctx.e.DB.prepare('UPDATE download_grants SET consumed_at=? WHERE id=? AND user_id=? AND consumed_at IS NULL AND expires_at>?')
        .bind(now(), row.id, session.user_id, now())
        .run()
    : null;
  if (!row || claimed?.meta.changes !== 1) {
    await record(auditEvent(ctx.e, 'DOWNLOAD_GRANT_REDEEMED', { type: 'download_grant', id: row?.id ?? null }, 'FAILURE', session.user_id));
    return deny('GRANT_INVALID', 410);
  }
  if (!isAllowedArtifactUrl(row.download_url)) return deny('ARTIFACT_URL_REJECTED', 409);
  await record(auditEvent(ctx.e, 'DOWNLOAD_GRANT_REDEEMED', { type: 'download_grant', id: row.id }, 'SUCCESS', session.user_id, { platform: row.platform }));
  return json({ downloadUrl: row.download_url });
}
