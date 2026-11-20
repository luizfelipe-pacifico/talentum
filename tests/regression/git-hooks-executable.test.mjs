import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Os hooks de `.githooks/` estavam versionados como 100644. O Git ignora hook
   sem permissão de execução e só imprime um "hint", então commit e push
   passavam sem typecheck nem testes, mesmo depois de `pnpm hooks:install`. */

const root = fileURLToPath(new URL('../../', import.meta.url));
const hooks = ['pre-commit', 'pre-push'];
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

test('hooks versionados como executáveis (100755), não 100644', () => {
  for (const hook of hooks) {
    const entry = git(root, 'ls-files', '--stage', '--', `.githooks/${hook}`);
    assert.match(entry, /^100755 /, `.githooks/${hook} precisa de modo 100755 no Git`);
  }
});

test('hooks:install ativa .githooks e torna os hooks executáveis num clone sem permissão', () => {
  const repo = mkdtempSync(join(tmpdir(), 'talentum-hooks-'));
  try {
    git(repo, 'init', '--quiet');
    mkdirSync(join(repo, '.githooks'));
    for (const hook of hooks) {
      copyFileSync(join(root, '.githooks', hook), join(repo, '.githooks', hook));
      chmodSync(join(repo, '.githooks', hook), 0o644);
    }

    execFileSync(process.execPath, [join(root, 'scripts', 'install-hooks.mjs')], { cwd: repo, stdio: 'pipe' });

    assert.equal(git(repo, 'config', '--get', 'core.hooksPath'), '.githooks');
    if (process.platform !== 'win32') {
      for (const hook of hooks) {
        assert.ok(statSync(join(repo, '.githooks', hook)).mode & 0o100, `${hook} continua sem permissão de execução`);
      }
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
