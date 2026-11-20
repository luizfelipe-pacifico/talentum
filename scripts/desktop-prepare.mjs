import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} terminou com código ${code}.`)));
  });
}

await run('pnpm', ['prisma:generate']);
await run('pnpm', ['build'], { ...process.env, TALENTUM_STANDALONE_BUILD: '1' });
await mkdir('.next/standalone/.next', { recursive: true });
await cp('.next/static', '.next/standalone/.next/static', { recursive: true, force: true });
await cp('public', '.next/standalone/public', { recursive: true, force: true });

/* O Next copia o .env da raiz para .next/standalone. Segredo de
   desenvolvimento nunca entra no instalador: remove e confere. */
for (const name of await readdir('.next/standalone')) {
  if (name.startsWith('.env') || name.startsWith('.dev.vars')) await rm(`.next/standalone/${name}`, { force: true });
}
const leftovers = (await readdir('.next/standalone')).filter((name) => name.startsWith('.env') || name.startsWith('.dev.vars'));
if (leftovers.length > 0) throw new Error('Arquivo de ambiente ficou no pacote; o build foi interrompido.');
