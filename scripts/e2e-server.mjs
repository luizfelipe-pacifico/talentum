import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { E2E_PORT, E2E_VAULT_PASSWORD, setUpVault } from './e2e-vault.mjs';

/* Servidor isolado dos testes ponta a ponta (Playwright): banco SQLite novo
   em temp/e2e, porta própria e build em .next-e2e, para nunca tocar no banco
   nem no `pnpm dev` de quem está desenvolvendo. Também serve o teste manual
   pela extensão Claude in Chrome (`pnpm test:manual`).

   O banco é cifrado e só abre com senha (docs/decisions/0009-local-vault-and-encrypted-database.md).
   Assim que o servidor responde, este script cria o cofre com a senha
   sintética de `scripts/e2e-vault.mjs` (sobrescrevível por
   TALENTUM_E2E_VAULT_PASSWORD), para os testes e o teste manual conseguirem
   desbloquear. Com TALENTUM_E2E_SKIP_VAULT_SETUP=1 o cofre não é criado e a
   primeira tela é "Proteja seus dados", para testar o primeiro uso. */

const directory = resolve('temp', 'e2e');
const databaseUrl = 'file:../temp/e2e/talentum-e2e.db';

mkdirSync(directory, { recursive: true });
// Banco, cofre, chave e sobras de uma execução anterior: começa do zero.
for (const name of readdirSync(directory)) {
  if (name.startsWith('talentum-e2e.db') || name.endsWith('.vault') || name.endsWith('.key') || name.endsWith('.tmp') || name === 'storage-state.json') {
    rmSync(resolve(directory, name), { force: true });
  }
}
// Pontos de restauração da execução anterior foram cifrados com outro cofre.
rmSync(resolve(directory, 'talentum-backups'), { recursive: true, force: true });

// O Next reescreve next-env.d.ts apontando para o distDir em uso. Guarda a
// versão versionada; tests/e2e/global-teardown.ts a devolve ao fim da execução.
const nextEnvFile = resolve('next-env.d.ts');
const nextEnvBackup = resolve('temp', 'e2e', 'next-env.d.ts.orig');
if (!readFileSync(nextEnvFile, 'utf8').includes('.next-e2e')) copyFileSync(nextEnvFile, nextEnvBackup);

// O aviso de nova versão não consulta o GitHub durante os testes.
const env = { ...process.env, DATABASE_URL: databaseUrl, TALENTUM_NEXT_DIST_DIR: '.next-e2e', TALENTUM_UPDATE_CHECK: 'off' };

const server = spawn(
  process.execPath,
  [resolve('node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--hostname', '127.0.0.1', '--port', String(E2E_PORT)],
  { stdio: 'inherit', env },
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => {
  // Fora do Playwright (teste manual) não há global-teardown: devolve aqui.
  if (existsSync(nextEnvBackup)) copyFileSync(nextEnvBackup, nextEnvFile);
  process.exit(code ?? 0);
});

if (process.env.TALENTUM_E2E_SKIP_VAULT_SETUP !== '1') {
  setUpVault(`http://127.0.0.1:${E2E_PORT}`, E2E_VAULT_PASSWORD).then(
    (created) => console.log(created ? '[e2e] Cofre de teste criado com a senha sintética.' : '[e2e] Cofre de teste já existia.'),
    (error) => console.error(`[e2e] Não foi possível criar o cofre de teste: ${error.message}`),
  );
}
