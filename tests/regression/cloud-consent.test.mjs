import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* BFF da LP depois da conclusão da trilha de nuvem: aceite, renovação por
   POST, origem obrigatória, sem cache, resultado do login e loopback do
   desktop. Testes das decisões puras e da forma das rotas. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const flow = await import(new URL('apps/web/src/server/auth-flow.ts', root).href);
const { safeReturn, privatePageFor } = await import(new URL('apps/web/src/server/return-to.ts', root).href);
const { LEGAL_VERSIONS: web } = await import(new URL('apps/web/src/server/legal.ts', root).href);
const { LEGAL_VERSIONS: worker } = await import(new URL('cloudflare/src/env.ts', root).href);

test('a LP e o Worker exigem as mesmas versões de Termos e Privacidade', () => {
  assert.deepEqual({ ...web }, { ...worker });
});

test('renovação de sessão é POST com checagem de origem; GET não rotaciona (Open item 1)', async () => {
  const route = await read('apps/web/src/app/api/auth/refresh/route.ts');
  assert.match(route, /export async function POST/);
  assert.match(route, /sameOrigin\(request\.headers\)/);
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  assert.doesNotMatch(get, /cloud\(/, 'o GET apenas leva a /entrar');
  const middleware = await read('apps/web/src/middleware.ts');
  assert.doesNotMatch(middleware, /\/api\/auth\/refresh/);
});

test('toda rota de mutação do BFF confere a origem e responde sem cache (Open items 2 e 7)', async () => {
  for (const path of ['auth/start', 'auth/mfa', 'auth/refresh', 'auth/logout', 'releases/[releaseId]/download-grants']) {
    const source = await read(`apps/web/src/app/api/${path}/route.ts`);
    assert.match(source, /sameOrigin\(request\.headers\)/, path);
    assert.match(source, /redirectNoStore|bffError|no-store/, path);
  }
  const http = await read('apps/web/src/server/http.ts');
  assert.match(http, /'Cache-Control', NO_STORE/);
});

test('resultado do login: sessão, desafio pendente ou loopback do desktop; o resto é inválido', () => {
  assert.equal(flow.loginOutcome({ accessToken: 'a', refreshToken: 'r', accessExpiresInSeconds: 900, refreshExpiresInSeconds: 60 }).kind, 'session');
  assert.equal(flow.loginOutcome({ mfaRequired: true, mfaToken: 't', expiresInSeconds: 300 }).kind, 'mfa');
  assert.equal(flow.loginOutcome({ desktopRedirect: 'http://127.0.0.1:53123/callback?code=c&state=s' }).kind, 'desktop');
  for (const url of [
    'https://ataque.example/callback?code=c&state=s',
    'http://localhost:53123/callback?code=c&state=s',
    'http://127.0.0.1:53123/callback?code=c&state=s&next=https://ataque.example',
    'http://127.0.0.1/callback?code=c&state=s',
    'javascript:alert(1)',
  ]) {
    assert.equal(flow.loginOutcome({ desktopRedirect: url }).kind, 'invalid', url);
  }
  assert.equal(flow.loginOutcome(null).kind, 'invalid');
  assert.equal(flow.loginOutcome({ accessToken: 'a' }).kind, 'invalid');
});

test('destino de volta só aceita páginas do próprio site (open redirect)', () => {
  assert.equal(safeReturn('/conta'), '/conta');
  for (const value of ['https://ataque.example', '//ataque.example', '/api/auth/logout', null, '']) assert.equal(safeReturn(value), '/downloads');
  assert.equal(privatePageFor('/conta/mfa'), '/conta');
  assert.equal(privatePageFor('/contas'), null);
});

test('download só redireciona para hosts do GitHub em https', () => {
  assert.equal(flow.isArtifactUrl('https://github.com/o/r/releases/download/v1/x.exe'), true);
  for (const url of ['http://github.com/x', 'https://github.com.ataque.example/x', 'https://user:pw@github.com/x', 42]) assert.equal(flow.isArtifactUrl(url), false);
});

test('CSP da LP libera somente o Turnstile e os destinos fixos de formulário', async () => {
  const middleware = await read('apps/web/src/middleware.ts');
  assert.match(middleware, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(middleware, /form-action 'self' https:\/\/accounts\.google\.com https:\/\/github\.com https:\/\/\*\.githubusercontent\.com/);
  assert.doesNotMatch(middleware, /unsafe-inline'[^;]*script-src|script-src[^;]*unsafe-inline/);
});

test('avisos de erro do login e da verificação', () => {
  assert.equal(flow.startErrorNotice(403, 'CHALLENGE_FAILED'), 'desafio');
  assert.equal(flow.startErrorNotice(429, 'RATE_LIMITED'), 'limite');
  assert.equal(flow.startErrorNotice(503, null), 'indisponivel');
  assert.equal(flow.mfaErrorNotice('MFA_LOCKED'), 'bloqueado');
  assert.equal(flow.mfaErrorNotice('INVALID_MFA_CODE'), 'codigo');
  assert.equal(flow.mfaErrorNotice('MFA_CHALLENGE_EXPIRED'), 'expirado');
});

test('downloads e LP mostram Windows, Linux e macOS; macOS honesto como "em breve"', async () => {
  const page = await read('apps/web/src/app/downloads/page.tsx');
  for (const key of ['WINDOWS', 'LINUX', 'MACOS', 'bi-windows', 'bi-ubuntu', 'bi-apple']) assert.ok(page.includes(key), key);
  assert.match(page, /assinado e notarizado/);
  const lp = await read('apps/web/src/components/lp/landing-page.tsx');
  assert.match(lp, /<h3>macOS<\/h3>[\s\S]{0,200}Em breve/);
  const icons = await read('apps/web/src/components/lp/icons.tsx');
  assert.match(icons, /'bi-apple'/);
});
