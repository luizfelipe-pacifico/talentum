import { cp, mkdir } from 'node:fs/promises';
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
