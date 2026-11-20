import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

/* A landing page também abria dentro do sistema, em localhost:3000/lp, pela
   ponte de pré-visualização. Quem desenvolvia via a LP e o sistema na mesma
   porta e confundia os dois. Agora cada um tem a sua: o sistema na 3000 e a
   LP só na 3100 (`pnpm dev:web`). */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const exists = (path) =>
  access(new URL(path, root)).then(
    () => true,
    () => false,
  );

test('o sistema não serve a landing page em /lp', async () => {
  assert.equal(await exists('src/app/lp/page.tsx'), false, 'a ponte src/app/lp ainda existe');
  assert.doesNotMatch(await read('src/components/app-shell.tsx'), /'\/lp'/);
});

test('sistema e landing page escutam em portas distintas', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const web = JSON.parse(await read('apps/web/package.json'));
  const system = (await read('scripts/dev.mjs')).match(/const port = (\d+);/)?.[1];
  const lp = web.scripts.dev.match(/-p (\d+)/)?.[1];
  assert.equal(system, '3000');
  assert.equal(lp, '3100');
  assert.match(web.scripts.start, /-p 3100/);
  assert.match(pkg.scripts['dev:web'] ?? '', /apps\/web dev/, 'falta o comando pnpm dev:web');
});
