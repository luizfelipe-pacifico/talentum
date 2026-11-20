import type { Env } from './env.ts';
import { now } from './lib/crypto.ts';

/* Retenção mínima do D1, executada pelo cron (docs/DATABASE.md, Retention).

   Cada prazo abaixo está publicado em /privacidade; mudar um valor aqui exige
   mudar a página e o DATABASE.md no mesmo change set. */

const DAY = 86_400_000;

export const RETENTION_DAYS = {
  actionCodes: 1,
  authTransactions: 1,
  rateLimitWindows: 1,
  idempotencyKeys: 1,
  mfaChallenges: 1,
  desktopRequests: 1,
  sessions: 30,
  downloadGrants: 30,
  news: 30,
  securityEvents: 180,
  auditEvents: 365,
} as const;

export async function purge(e: Env) {
  const before = (days: number) => now(-days * DAY);
  const statements: [string, string, string][] = [
    ['action_codes', 'DELETE FROM action_codes WHERE expires_at<?', before(RETENTION_DAYS.actionCodes)],
    ['auth_transactions', 'DELETE FROM auth_transactions WHERE expires_at<?', before(RETENTION_DAYS.authTransactions)],
    ['rate_limit_windows', 'DELETE FROM rate_limit_windows WHERE window_started_at<?', before(RETENTION_DAYS.rateLimitWindows)],
    ['idempotency_keys', 'DELETE FROM idempotency_keys WHERE created_at<?', before(RETENTION_DAYS.idempotencyKeys)],
    ['mfa_challenges', 'DELETE FROM mfa_challenges WHERE expires_at<?', before(RETENTION_DAYS.mfaChallenges)],
    ['desktop_auth_requests', 'DELETE FROM desktop_auth_requests WHERE expires_at<?', before(RETENTION_DAYS.desktopRequests)],
    ['mfa_recovery_reveals', 'DELETE FROM mfa_recovery_reveals WHERE expires_at<?', now()],
    // Sessão expirada ou revogada há mais de 30 dias: a família e os refresh tokens saem em cascata.
    ['auth_sessions', 'DELETE FROM auth_sessions WHERE COALESCE(revoked_at,expires_at)<?', before(RETENTION_DAYS.sessions)],
    ['download_grants', 'DELETE FROM download_grants WHERE expires_at<?', before(RETENTION_DAYS.downloadGrants)],
    ['news_items', 'DELETE FROM news_items WHERE published_at<?', before(RETENTION_DAYS.news)],
    ['security_events', 'DELETE FROM security_events WHERE created_at<?', before(RETENTION_DAYS.securityEvents)],
    ['audit_events', 'DELETE FROM audit_events WHERE created_at<?', before(RETENTION_DAYS.auditEvents)],
  ];
  const removed: Record<string, number> = {};
  for (const [table, sql, cutoff] of statements) {
    const result = await e.DB.prepare(sql).bind(cutoff).run();
    removed[table] = result.meta.changes;
  }
  return removed;
}
