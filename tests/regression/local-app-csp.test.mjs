import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* O app local e o renderer do Electron não enviavam Content-Security-Policy
   (docs/SECURITY.md, item aberto 10). Um texto hostil que escapasse para o DOM,
   por exemplo a descrição de um extrato importado, rodaria script com acesso à
   ponte `window.talentumWindow`. A política usa nonce por requisição, como a
   landing page; `'unsafe-eval'` e `ws:` existem só em desenvolvimento, para o
   `next dev` continuar funcionando. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const directive = (policy, name) => policy.split('; ').find((part) => part.startsWith(`${name} `)) ?? '';

test('a política de produção só executa script com nonce', async () => {
  const { localContentSecurityPolicy } = await import(new URL('src/server/csp.ts', root).href);
  const policy = localContentSecurityPolicy('bm9uY2U=', false);
  const script = directive(policy, 'script-src');
  assert.match(script, /'nonce-bm9uY2U='/);
  assert.match(script, /'strict-dynamic'/);
  assert.doesNotMatch(script, /'unsafe-inline'|'unsafe-eval'/);
  assert.equal(directive(policy, 'object-src'), "object-src 'none'");
  assert.equal(directive(policy, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive(policy, 'base-uri'), "base-uri 'self'");
  assert.equal(directive(policy, 'connect-src'), "connect-src 'self'");
  assert.doesNotMatch(policy, /https?:|\*/, 'nenhuma origem externa');
});

test('desenvolvimento ganha só o que o next dev exige', async () => {
  const { localContentSecurityPolicy } = await import(new URL('src/server/csp.ts', root).href);
  const policy = localContentSecurityPolicy('bm9uY2U=', true);
  assert.match(directive(policy, 'script-src'), /'unsafe-eval'/);
  assert.match(directive(policy, 'connect-src'), /ws:/);
});

test('o middleware aplica a política às páginas e o layout usa o nonce', async () => {
  const middleware = await read('src/middleware.ts');
  assert.match(middleware, /localContentSecurityPolicy\(/);
  assert.match(middleware, /Content-Security-Policy/);
  assert.match(middleware, /x-nonce/);
  // A checagem de Host da API continua valendo.
  assert.match(middleware, /isLoopbackHost\(/);
  const layout = await read('src/app/layout.tsx');
  assert.match(layout, /headers\(\)/);
  assert.match(layout, /<script nonce=\{nonce\}/);
});
