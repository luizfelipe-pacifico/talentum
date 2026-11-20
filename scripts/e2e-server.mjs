import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/* Servidor isolado dos testes ponta a ponta (Playwright): banco SQLite novo
   em temp/e2e, porta própria e build em .next-e2e, para nunca tocar no banco
   nem no `pnpm dev` de quem está desenvolvendo. Também serve o teste manual
   pela extensão Claude in Chrome (`pnpm test:manual`). */

const E2E_PORT = 3210;
const databaseFile = resolve('temp', 'e2e', 'talentum-e2e.db');
const databaseUrl = 'file:../temp/e2e/talentum-e2e.db';

mkdirSync(resolve('temp', 'e2e'), { recursive: true });
for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(databaseFile + suffix, { force: true });

// O Next reescreve next-env.d.ts apontando para o distDir em uso. Guarda a
// versão versionada; tests/e2e/global-teardown.ts a devolve ao fim da execução.
const nextEnvFile = resolve('next-env.d.ts');
const nextEnvBackup = resolve('temp', 'e2e', 'next-env.d.ts.orig');
if (!readFileSync(nextEnvFile, 'utf8').includes('.next-e2e')) copyFileSync(nextEnvFile, nextEnvBackup);

const env = { ...process.env, DATABASE_URL: databaseUrl, TALENTUM_NEXT_DIST_DIR: '.next-e2e' };

execFileSync(process.execPath, [resolve('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
  stdio: 'inherit',
  env,
});

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
