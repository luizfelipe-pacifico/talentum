/* Estado em memória do cofre: a DEK enquanto desbloqueado e as sessões locais.

   A DEK só existe aqui, na memória do backend local, e só depois do
   desbloqueio. Bloquear zera o buffer, encerra todas as sessões e avisa quem
   se registrou (a conexão do banco fecha). Fica em `globalThis` pelo mesmo
   motivo dos códigos de ação: o Next pode carregar este módulo mais de uma
   vez no mesmo processo, e duas cópias do estado seriam duas verdades.

   A sessão é um token aleatório e opaco num cookie HttpOnly e SameSite=Strict.
   Guardamos só o SHA-256 dele. O cookie leva a porta no nome: navegadores não
   isolam cookie por porta, e o servidor de teste (3210) não pode derrubar a
   sessão de quem usa o `pnpm dev` (3000). */

import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_PREFIX = 'talentum-session';
export const MIN_AUTO_LOCK_MINUTES = 1;
export const MAX_AUTO_LOCK_MINUTES = 60;

/** Rotas do cofre que funcionam sem sessão: sem elas ninguém conseguiria desbloquear. */
export const PUBLIC_VAULT_PATHS: readonly string[] = ['/api/vault/status', '/api/vault/setup', '/api/vault/unlock', '/api/vault/recover'];

type Session = { createdAt: number };

type Runtime = {
  dek: Buffer | null;
  sessions: Map<string, Session>;
  lastActivityAt: number;
  autoLockMinutes: number;
  onLock: Set<() => void | Promise<void>>;
  timer: ReturnType<typeof setInterval> | null;
};

const store = globalThis as typeof globalThis & { talentumVault?: Runtime };
store.talentumVault ??= { dek: null, sessions: new Map(), lastActivityAt: 0, autoLockMinutes: 10, onLock: new Set(), timer: null };
const runtime: Runtime = store.talentumVault;

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export function isUnlocked(): boolean {
  return runtime.dek !== null;
}

/** Cópia da DEK para uma operação; quem chama não guarda a referência. */
export function currentDek(): Buffer | null {
  return runtime.dek ? Buffer.from(runtime.dek) : null;
}

/** Instala a DEK e abre a primeira sessão. Devolve o token do cookie. */
export function unlockWith(dek: Buffer, autoLockMinutes: number, now = Date.now()): string {
  if (runtime.dek && !runtime.dek.equals(dek)) runtime.dek.fill(0);
  runtime.dek = Buffer.from(dek);
  runtime.autoLockMinutes = autoLockMinutes;
  runtime.lastActivityAt = now;
  ensureTimer();
  return createSession(now);
}

export function createSession(now = Date.now()): string {
  const token = randomBytes(32).toString('base64url');
  runtime.sessions.set(digest(token), { createdAt: now });
  return token;
}

/**
 * A sessão existe e o cofre está aberto. Aplica o bloqueio por inatividade
 * antes de responder: um pedido depois do prazo encontra o cofre fechado.
 */
export function sessionIsValid(token: string | null | undefined, now = Date.now()): boolean {
  if (!token || !runtime.dek) return false;
  if (idleExpired(now)) {
    void lock();
    return false;
  }
  return runtime.sessions.has(digest(token));
}

/** Sessão identificada pelo hash, para vincular códigos de ação sem guardar o token. */
export function sessionDigest(token: string): string {
  return digest(token);
}

export function sessionDigestIsValid(hash: string, now = Date.now()): boolean {
  if (!runtime.dek) return false;
  if (idleExpired(now)) {
    void lock();
    return false;
  }
  return runtime.sessions.has(hash);
}

function idleExpired(now: number): boolean {
  return runtime.dek !== null && now - runtime.lastActivityAt > runtime.autoLockMinutes * 60_000;
}

/** Atividade da pessoa (teclado, ponteiro, toque) relatada pela interface. */
export function recordActivity(now = Date.now()): void {
  if (runtime.dek && !idleExpired(now)) runtime.lastActivityAt = now;
}

export function setAutoLockMinutes(minutes: number): void {
  runtime.autoLockMinutes = minutes;
}

export function autoLockMinutes(): number {
  return runtime.autoLockMinutes;
}

/** Segundos até o bloqueio automático, para a interface avisar antes. */
export function secondsUntilAutoLock(now = Date.now()): number {
  if (!runtime.dek) return 0;
  return Math.max(0, Math.ceil((runtime.lastActivityAt + runtime.autoLockMinutes * 60_000 - now) / 1000));
}

export function onLock(listener: () => void | Promise<void>): void {
  runtime.onLock.add(listener);
}

/** Fecha o cofre: zera a DEK, encerra todas as sessões e fecha o banco. */
export async function lock(): Promise<void> {
  const dek = runtime.dek;
  runtime.dek = null;
  runtime.sessions.clear();
  dek?.fill(0);
  for (const listener of runtime.onLock) {
    try {
      await listener();
    } catch {
      /* fechar o banco é melhor esforço: a DEK já saiu da memória */
    }
  }
}

function ensureTimer() {
  if (runtime.timer) return;
  // Bloqueia mesmo sem nenhum pedido chegando: a DEK não fica na memória além do prazo.
  runtime.timer = setInterval(() => {
    if (idleExpired(Date.now())) void lock();
  }, 15_000);
  runtime.timer.unref?.();
}

/* Cookie. */

export function sessionCookieName(host: string | null): string {
  const port = host?.match(/:(\d+)$/)?.[1] ?? '80';
  return `${SESSION_COOKIE_PREFIX}-${port}`;
}

export function readSessionToken(request: Request): string | null {
  const name = sessionCookieName(request.headers.get('host'));
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}

/** Atributos do cookie. `Secure` só quando a página veio por HTTPS: o app local é servido por HTTP no loopback. */
export function sessionCookie(request: Request, token: string | null): string {
  const name = sessionCookieName(request.headers.get('host'));
  const secure = request.headers.get('x-forwarded-proto') === 'https' || new URL(request.url).protocol === 'https:';
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : [])];
  if (token === null) return `${name}=; ${attributes.join('; ')}; Max-Age=0`;
  return `${name}=${token}; ${attributes.join('; ')}`;
}

/** Somente para teste: devolve o estado ao inicial. */
export async function resetVaultRuntime(): Promise<void> {
  await lock();
  runtime.lastActivityAt = 0;
  runtime.autoLockMinutes = 10;
}
