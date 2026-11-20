/* Senha sintética e configuração do cofre do servidor isolado de teste.

   Usada só por scripts/e2e-server.mjs, pelos testes Playwright e pelos testes
   node que falam com um backend no ar. Nunca é a senha de ninguém: o banco de
   teste é recriado do zero a cada execução, em temp/e2e, sem dado real.
   docs/BEST_PRACTICES.md, "Manual testing in the browser". */

export const E2E_PORT = Number(process.env.TALENTUM_E2E_PORT) || 3210;
export const E2E_VAULT_PASSWORD = process.env.TALENTUM_E2E_VAULT_PASSWORD || 'cofre sintetico de teste 3210';

async function waitForHealth(base, deadline = Date.now() + 180_000) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health/live`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('o servidor de teste não respondeu');
}

/** Faz uma chamada com código de ação, levando o cookie de sessão quando houver. */
export async function vaultCall(base, method, path, json, cookie = '') {
  const issued = await fetch(`${base}/api/action-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ method, path }),
  });
  if (!issued.ok) return { status: issued.status, payload: await issued.json().catch(() => null), cookie };
  const { actionCode } = await issued.json();
  const headers = { 'X-Action-Code': actionCode, ...(cookie ? { Cookie: cookie } : {}) };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
  const setCookie = response.headers.get('set-cookie');
  const nextCookie = setCookie ? setCookie.split(';')[0] : cookie;
  return { status: response.status, payload: await response.json().catch(() => null), cookie: nextCookie };
}

/** Desbloqueia e devolve o cookie de sessão (`nome=valor`). */
export async function unlockSession(base, password = E2E_VAULT_PASSWORD) {
  const result = await vaultCall(base, 'POST', '/api/vault/unlock', { password });
  if (result.status !== 200) throw new Error(`desbloqueio recusado (${result.status})`);
  if (result.payload?.recoveryCode) await vaultCall(base, 'POST', '/api/vault/recovery-code/confirm', undefined, result.cookie);
  return result.cookie;
}

/**
 * Cria o cofre de teste se ainda não existir e deixa o bloqueio automático em
 * 60 minutos, o máximo, para uma execução longa não bloquear no meio.
 * Devolve `true` quando criou agora.
 */
export async function setUpVault(base, password = E2E_VAULT_PASSWORD) {
  await waitForHealth(base);
  const status = await vaultCall(base, 'GET', '/api/vault/status');
  let cookie;
  let created = false;
  if (status.payload?.state === 'uninitialized') {
    const setup = await vaultCall(base, 'POST', '/api/vault/setup', { password });
    if (setup.status === 201) {
      created = true;
      cookie = setup.cookie;
      await vaultCall(base, 'POST', '/api/vault/recovery-code/confirm', undefined, cookie);
    } else if (setup.status !== 409) {
      throw new Error(`configuração recusada (${setup.status})`);
    }
  }
  cookie ??= await unlockSession(base, password);
  await vaultCall(base, 'PATCH', '/api/vault/settings', { autoLockMinutes: 60 }, cookie);
  return created;
}
