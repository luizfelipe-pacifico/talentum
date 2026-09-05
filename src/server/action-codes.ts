import { createHash, randomBytes } from 'node:crypto';

type ActionCodeRecord = { method: string; path: string; expiresAt: number };
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

export function issueActionCode(method: string, path: string) {
  clearExpired();
  const actionCode = randomBytes(32).toString('base64url');
  actionCodes.set(digest(actionCode), { method, path, expiresAt: Date.now() + TTL_MS });
  return { actionCode, expiresInSeconds: TTL_MS / 1000 };
}

export function consumeActionCode(actionCode: string | null, method: string, path: string) {
  if (!actionCode) return false;
  clearExpired();
  const key = digest(actionCode);
  const record = actionCodes.get(key);
  if (!record) return false;
  actionCodes.delete(key);
  return record.expiresAt > Date.now() && record.method === method && record.path === path;
}
