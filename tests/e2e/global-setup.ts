import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_PORT, setUpVault, unlockSession } from '../../scripts/e2e-vault.mjs';

/* O banco de teste é cifrado e só abre com a senha. Antes dos testes: cria o
   cofre se o servidor ainda não criou, desbloqueia com a senha sintética e
   grava o cookie de sessão no estado que o Playwright carrega em cada teste. */
export default async function globalSetup() {
  const base = `http://127.0.0.1:${E2E_PORT}`;
  await setUpVault(base);
  const cookie = await unlockSession(base);
  const separator = cookie.indexOf('=');
  const state = {
    cookies: [
      {
        name: cookie.slice(0, separator),
        value: cookie.slice(separator + 1),
        domain: '127.0.0.1',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Strict' as const,
      },
    ],
    origins: [],
  };
  mkdirSync(resolve('temp', 'e2e'), { recursive: true });
  writeFileSync(resolve('temp', 'e2e', 'storage-state.json'), JSON.stringify(state));
}
