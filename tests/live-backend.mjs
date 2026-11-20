import { E2E_PORT, E2E_VAULT_PASSWORD, vaultCall } from '../scripts/e2e-vault.mjs';

/* Sessão para os testes node que falam com um backend local no ar
   (accounts-e2e, import-e2e).

   O banco local é cifrado e só abre com senha. Estes testes nunca criam um
   cofre e nunca tentam adivinhar senha: no servidor isolado de teste
   (`pnpm test:manual`, porta 3210) usam a senha sintética; em qualquer outro
   endereço, só com TALENTUM_E2E_VAULT_PASSWORD definida. Sem isso a suíte é
   pulada, e nenhuma tentativa errada conta no atraso progressivo do cofre de
   quem está desenvolvendo. */

export async function liveSession(base) {
  try {
    const response = await fetch(`${base}/api/health/live`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return { cookie: null, reason: `Backend local indisponível em ${base}` };
  } catch {
    return { cookie: null, reason: `Backend local indisponível em ${base}` };
  }
  const port = Number(new URL(base).port || 80);
  const password = process.env.TALENTUM_E2E_VAULT_PASSWORD || (port === E2E_PORT ? E2E_VAULT_PASSWORD : null);
  if (!password) return { cookie: null, reason: `Backend em ${base} protegido por senha; defina TALENTUM_E2E_VAULT_PASSWORD com a senha de um cofre de teste` };
  const status = await vaultCall(base, 'GET', '/api/vault/status');
  if (status.payload?.state === 'uninitialized') return { cookie: null, reason: `Backend em ${base} ainda sem senha criada` };
  const unlocked = await vaultCall(base, 'POST', '/api/vault/unlock', { password });
  if (unlocked.status !== 200) return { cookie: null, reason: `Não foi possível desbloquear o backend em ${base} (${unlocked.status})` };
  return { cookie: unlocked.cookie, reason: null };
}

/** Faz todo `fetch` para o backend levar o cookie de sessão, sem reescrever cada chamada do teste. */
export function attachSession(base, cookie) {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(base)) return original(input, init);
    const headers = new Headers(init.headers);
    headers.set('Cookie', cookie);
    return original(input, { ...init, headers });
  };
}
