import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Dentro do pre-commit o Git exporta GIT_DIR apontando para o repositório
   verdadeiro. O teste dos hooks rodava `git init` num diretório temporário
   herdando esse ambiente: com GIT_DIR definido e sem árvore de trabalho, o Git
   reinicializava o repositório real como bare (core.bare=true) e a cópia de
   trabalho parava de funcionar a cada commit. O install-hooks também gravava
   core.hooksPath no repositório real. Comando git de teste nunca herda o
   ambiente de um hook. */

const root = fileURLToPath(new URL('../../', import.meta.url));
// Ambiente sem as variáveis que um hook do Git exporta.
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

test('o teste dos hooks não mexe no repositório em que o hook está rodando', () => {
  const victim = mkdtempSync(join(tmpdir(), 'talentum-victim-'));
  try {
    // Cenário real: o commit acontece numa worktree vinculada, e o hook recebe
    // GIT_DIR=.git/worktrees/<nome>; a configuração comum fica em .git/config.
    const main = join(victim, 'main');
    execFileSync('git', ['init', '--quiet', main], { env: clean });
    execFileSync('git', ['-C', main, '-c', 'user.name=t', '-c', 'user.email=t@t.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'base'], { env: clean });
    execFileSync('git', ['-C', main, 'worktree', 'add', '--quiet', join(victim, 'linked')], { env: clean });
    const gitDir = join(main, '.git', 'worktrees', 'linked');
    const env = { ...process.env, GIT_DIR: gitDir, GIT_INDEX_FILE: join(gitDir, 'index') };
    delete env.GIT_WORK_TREE;
    // Sem isto o `node --test` aninhado reporta ao processo pai em vez de rodar sozinho.
    delete env.NODE_TEST_CONTEXT;
    const run = spawnSync(process.execPath, ['--test', join(root, 'tests/regression/git-hooks-executable.test.mjs')], { cwd: root, env, encoding: 'utf8' });
    const config = (key) => spawnSync('git', ['--git-dir', join(main, '.git'), 'config', '--get', key], { encoding: 'utf8', env: clean }).stdout.trim();
    assert.notEqual(config('core.bare'), 'true', 'o repositório do hook virou bare');
    assert.equal(config('core.hooksPath'), '', 'core.hooksPath foi gravado no repositório do hook');
    assert.equal(run.status, 0, run.stdout + run.stderr);
  } finally {
    rmSync(victim, { recursive: true, force: true });
  }
});
