import { createHash, randomBytes } from 'node:crypto';
import { PUBLIC_VAULT_PATHS, sessionDigest, sessionDigestIsValid, sessionIsValid } from './vault/session.ts';

/* Códigos de ação da API local.

   Além de método e caminho, o código fica vinculado à sessão local: só é
   emitido para quem apresenta um cookie de sessão válido, e só é aceito
   enquanto essa sessão continuar aberta. Como toda rota funcional consome um
   código (diretamente ou por src/server/http.ts), este é o ponto central que
   exige o cofre desbloqueado. Nenhuma rota precisa lembrar disso por conta
   própria. As únicas exceções são as rotas do cofre que existem justamente
   para abrir a sessão (`PUBLIC_VAULT_PATHS`). */

type ActionCodeRecord = { method: string; path: string; expiresAt: number; session: string | null };
const TTL_MS = 60_000;

const globalStore = globalThis as typeof globalThis & {
  talentumActionCodes?: Map<string, ActionCodeRecord>;
};
const actionCodes = globalStore.talentumActionCodes ?? new Map<string, ActionCodeRecord>();
globalStore.talentumActionCodes = actionCodes;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function clearExpired(now = Date.now()) {
  for (const [key, record] of actionCodes) if (record.expiresAt <= now) actionCodes.delete(key);
}

export function isPublicPath(path: string): boolean {
  return PUBLIC_VAULT_PATHS.includes(path);
}

/**
 * Emite um código para o par método/caminho.
 *
 * Devolve `null` quando o caminho exige sessão e o token não corresponde a
 * uma sessão aberta: a rota de emissão responde `401 VAULT_LOCKED`.
 */
export function issueActionCode(method: string, path: string, sessionToken: string | null = null) {
  clearExpired();
  let session: string | null = null;
  if (!isPublicPath(path)) {
    if (!sessionIsValid(sessionToken)) return null;
    session = sessionDigest(sessionToken as string);
  }
  const actionCode = randomBytes(32).toString('base64url');
  actionCodes.set(digest(actionCode), { method, path, expiresAt: Date.now() + TTL_MS, session });
  return { actionCode, expiresInSeconds: TTL_MS / 1000 };
}

/**
 * Consome o código. Em rota protegida, `sessionToken` é o cookie da própria
 * requisição e precisa ser o da sessão que pediu o código: um código capturado
 * não serve sem o cookie, e o cookie de outra sessão também não.
 */
export function consumeActionCode(actionCode: string | null, method: string, path: string, sessionToken: string | null = null) {
  if (!actionCode) return false;
  clearExpired();
  const key = digest(actionCode);
  const record = actionCodes.get(key);
  if (!record) return false;
  actionCodes.delete(key);
  if (record.expiresAt <= Date.now() || record.method !== method || record.path !== path) return false;
  // Rota protegida: a sessão que pediu o código ainda precisa estar aberta (bloqueio manual ou por inatividade derruba).
  if (record.session === null) return isPublicPath(path);
  if (!sessionToken || sessionDigest(sessionToken) !== record.session) return false;
  return sessionDigestIsValid(record.session);
}
