import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/* Ativa os hooks versionados em `.githooks/`.

   O Git ignora hook sem permissão de execução e só imprime um aviso, então
   o commit passa sem testes. Além de apontar `core.hooksPath`, garante o bit
   de execução, que se perde em cópias, extrações de zip e alguns clones. */

const hooks = ['pre-commit', 'pre-push'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const repo = git('rev-parse', '--show-toplevel');
for (const hook of hooks) {
  const path = join(repo, '.githooks', hook);
  if (!existsSync(path)) throw new Error(`Hook ausente: .githooks/${hook}`);
  chmodSync(path, 0o755);
}

git('config', 'core.hooksPath', '.githooks');
console.log(`Hooks ativos (${hooks.join(', ')}): typecheck e testes rodam antes de commit e push.`);
