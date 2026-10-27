import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Regressões do BFF da landing page. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const session = {
  ...(await import(new URL('apps/web/src/server/session.ts', root).href)),
  ...(await import(new URL('apps/web/src/server/site-url.ts', root).href)),
};

test('callback OAuth só é aceito no navegador que iniciou o login (CSRF de login)', async () => {
  const binding = session.createStateBinding('state-sintetico');
  assert.equal(session.stateMatches(binding, 'state-sintetico'), true);
  assert.equal(session.stateMatches(binding, 'state-de-outra-pessoa'), false);
  assert.equal(session.stateMatches(undefined, 'state-sintetico'), false);
  assert.equal(session.stateMatches('', 'state-sintetico'), false);

  const start = await read('apps/web/src/app/api/auth/start/route.ts');
  const callback = await read('apps/web/src/app/api/auth/callback/route.ts');
  assert.match(start, /OAUTH_STATE_COOKIE/);
  assert.match(callback, /stateMatches\(/);
});

test('cookies __Host- saem com Secure também em desenvolvimento', () => {
  // Sem Secure o navegador descarta cookies com prefixo __Host-, e o login em
  // `next dev` voltava para a LP sem sessão.
  for (const env of ['development', 'production', 'test']) {
    assert.equal(session.cookieOptions(60, env).secure, true, env);
    assert.equal(session.cookieOptions(60, env).httpOnly, true, env);
    assert.equal(session.cookieOptions(60, env).path, '/', env);
  }
});

test('o BFF repassa ao Worker o IP de quem acessou a LP', async () => {
  const bff = await read('apps/web/src/server/cloudflare.ts');
  assert.match(bff, /X-Talentum-Client-IP/);
  assert.equal(session.clientIp(new Headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' })), '198.51.100.7');
  assert.equal(session.clientIp(new Headers({ 'x-real-ip': '198.51.100.8' })), '198.51.100.8');
  assert.equal(session.clientIp(new Headers()), null);
});

test('a checagem de origem aceita o próprio site pelo Host, não por request.url', async () => {
  // Em `next dev`, request.url vinha como localhost enquanto o navegador em
  // 127.0.0.1 enviava esse Origin: o botão "Sair" respondia 403.
  const headers = (entries) => new Headers(entries);
  assert.equal(session.sameOrigin(headers({ origin: 'http://127.0.0.1:3300', host: '127.0.0.1:3300' })), true);
  assert.equal(session.sameOrigin(headers({ origin: 'https://talentum-tech.vercel.app', host: 'interno', 'x-forwarded-host': 'talentum-tech.vercel.app' })), true);
  assert.equal(session.sameOrigin(headers({ origin: 'https://ataque.example', host: '127.0.0.1:3300' })), false);
  assert.equal(session.sameOrigin(headers({ origin: 'null', host: '127.0.0.1:3300' })), false);
  // Sem Origin (navegação de formulário antiga), a decisão fica com SameSite=Lax.
  assert.equal(session.sameOrigin(headers({ host: '127.0.0.1:3300' })), true);
  for (const path of ['apps/web/src/app/api/auth/logout/route.ts', 'apps/web/src/app/api/releases/[releaseId]/download-grants/route.ts']) {
    const source = await read(path);
    assert.match(source, /sameOrigin\(request\.headers\)/, path);
    assert.doesNotMatch(source, /origin!==new URL\(request\.url\)\.origin/, path);
  }
});

test('redirecionamentos do BFF ficam no host que a pessoa acessou', async () => {
  // new URL('/', request.url) levava quem estava em 127.0.0.1 para localhost,
  // e os cookies recém-gravados ficavam para trás.
  const request = new Request('http://localhost:3300/api/auth/callback', { headers: { host: '127.0.0.1:3300' } });
  assert.equal(session.siteUrl('/downloads', request).href, 'http://127.0.0.1:3300/downloads');
  const vercel = new Request('http://interno/api/auth/start', { headers: { host: 'interno', 'x-forwarded-host': 'talentum-tech.vercel.app', 'x-forwarded-proto': 'https' } });
  assert.equal(session.siteUrl('/?auth=erro', vercel).href, 'https://talentum-tech.vercel.app/?auth=erro');
  for (const path of ['start', 'callback', 'refresh', 'logout']) {
    const source = await read(`apps/web/src/app/api/auth/${path}/route.ts`);
    assert.doesNotMatch(source, /new URL\('\/[^']*',\s*(request\.url|url)\)/, path);
  }
});
