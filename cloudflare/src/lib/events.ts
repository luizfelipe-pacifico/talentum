import type { Env } from '../env.ts';
import { now } from './crypto.ts';

/* Trilhas de segurança e auditoria (docs/SECURITY.md, Open items, item 13).

   Só tipos, resultados e IDs opacos. Nunca token, código, e-mail, IP, nome
   público, texto de publicação ou valor financeiro: `metadata` aceita apenas
   chaves desta lista, com valores curtos. */

type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
const METADATA_KEYS = new Set(['clientKind', 'platform', 'action', 'target', 'reason', 'method']);

function cleanMetadata(metadata?: Record<string, string>): string | null {
  if (!metadata) return null;
  const safe = Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => METADATA_KEYS.has(key))
      .map(([key, value]) => [key, String(value).slice(0, 40)]),
  );
  return Object.keys(safe).length ? JSON.stringify(safe) : null;
}

export function securityEvent(
  e: Env,
  type: string,
  outcome: 'SUCCESS' | 'FAILURE' | 'BLOCKED',
  risk: Risk,
  refs: { userId?: string | null; sessionId?: string | null; metadata?: Record<string, string> } = {},
) {
  return e.DB.prepare(
    'INSERT INTO security_events(id,user_id,session_id,event_type,outcome,risk_level,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
  ).bind(crypto.randomUUID(), refs.userId ?? null, refs.sessionId ?? null, type, outcome, risk, cleanMetadata(refs.metadata), now());
}

export function auditEvent(
  e: Env,
  action: string,
  resource: { type: string; id: string | null },
  outcome: 'SUCCESS' | 'FAILURE',
  actorUserId: string | null,
  metadata?: Record<string, string>,
) {
  return e.DB.prepare(
    'INSERT INTO audit_events(id,actor_user_id,action,resource_type,resource_id,outcome,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
  ).bind(crypto.randomUUID(), actorUserId, action, resource.type, resource.id, outcome, cleanMetadata(metadata), now());
}

/** Grava sem deixar uma falha da trilha derrubar a resposta principal. */
export async function record(...statements: ReturnType<typeof securityEvent>[]) {
  for (const statement of statements) await statement.run().catch(() => undefined);
}
