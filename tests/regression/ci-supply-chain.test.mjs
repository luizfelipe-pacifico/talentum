import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/* CI de cadeia de suprimentos (docs/SECURITY.md, Open items, itens 9 e 21). */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('workflows fixam toda action por SHA completo e nunca rodam pull_request_target', async () => {
  for (const name of await readdir(new URL('.github/workflows/', root))) {
    const text = await read(`.github/workflows/${name}`);
    assert.doesNotMatch(text, /pull_request_target/, name);
    for (const [, ref] of text.matchAll(/uses:\s*[^@\s]+@(\S+)/g)) assert.match(ref, /^[0-9a-f]{40}$/, `${name}: ${ref}`);
    assert.match(text, /^permissions:\s*\n\s+contents: read/m, name);
  }
});

test('há varredura de segredos, revisão de dependências, CodeQL e Dependabot', async () => {
  const security = await read('.github/workflows/security.yml');
  assert.match(security, /gitleaks\/gitleaks-action@/);
  assert.match(security, /fetch-depth: 0/, 'o gitleaks lê o histórico inteiro');
  assert.match(security, /GITLEAKS_ENABLE_UPLOAD_ARTIFACT: false/, 'o relatório com o valor nunca vira artefato');
  assert.match(security, /actions\/dependency-review-action@/);
  assert.match(security, /github\/codeql-action\/analyze@/);
  const dependabot = await read('.github/dependabot.yml');
  for (const ecosystem of ['npm', 'github-actions']) assert.match(dependabot, new RegExp(`package-ecosystem: ${ecosystem}`));
});

test('o CI prova o isolamento do pacote da Vercel depois do build da LP', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.ok(ci.indexOf('pnpm web:build') < ci.indexOf('node scripts/web-isolation-check.mjs'));
  const { checkIsolation } = await import(new URL('scripts/web-isolation-check.mjs', root).href);
  const missing = checkIsolation('/caminho/inexistente/.next');
  assert.equal(missing.ok, false);
});
