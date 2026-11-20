import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

/* A sessão local é exigida em toda rota da API, de forma central.

   O ponto central é o código de ação (src/server/action-codes.ts): só é
   emitido com sessão aberta e só é aceito enquanto ela continuar aberta. Este
   teste enumera todos os arquivos `src/app/api/**\/route.ts` e confere que cada
   handler consome um código, e que nenhum caminho fora das quatro rotas
   públicas do cofre recebe código sem sessão. Uma rota nova que esqueça o
   código falha aqui. */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const actionCodes = await import(new URL('src/server/action-codes.ts', root).href);
const session = await import(new URL('src/server/vault/session.ts', root).href);

/* Exceções documentadas: a emissão do código e a sonda de vida (CLAUDE.md, Architecture rules). */
const WITHOUT_ACTION_CODE = new Set(['action-codes/route.ts', 'health/live/route.ts']);
const PUBLIC = ['/api/vault/status', '/api/vault/setup', '/api/vault/unlock', '/api/vault/recover'];

async function routes() {
  const entries = await readdir(new URL('src/app/api/', root), { recursive: true });
  return entries.map((entry) => entry.replaceAll('\\', '/')).filter((entry) => entry.endsWith('route.ts'));
}

/** Caminho concreto da rota, com um valor sintético em cada segmento dinâmico. */
function concretePath(file) {
  return `/api/${file.replace(/\/?route\.ts$/, '').replace(/\[[^\]]+\]/g, 'id-sintetico')}`;
}

test('só as quatro rotas que abrem o cofre funcionam sem sessão', () => {
  assert.deepEqual([...session.PUBLIC_VAULT_PATHS].sort(), [...PUBLIC].sort());
});

test('todo handler de toda rota consome um código de ação', async () => {
  const files = await routes();
  assert.ok(files.length >= 50, `esperava todas as rotas, achou ${files.length}`);
  for (const file of files) {
    if (WITHOUT_ACTION_CODE.has(file)) continue;
    const source = await read(`src/app/api/${file}`);
    const handlers = [...source.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b[\s\S]*?(?=\nexport |$)/g)];
    assert.ok(handlers.length > 0, `${file}: nenhum handler`);
    for (const [body, method] of handlers) {
      assert.match(body, /consumeActionCode\(|requireActionCode\(request\)|guardWithProfile\(request\)/, `${file} ${method} não consome código de ação`);
    }
  }
});

test('sem sessão, nenhum caminho protegido recebe código de ação', async () => {
  await session.resetVaultRuntime();
  for (const file of await routes()) {
    if (WITHOUT_ACTION_CODE.has(file)) continue;
    const path = concretePath(file);
    const issued = actionCodes.issueActionCode('GET', path, null);
    if (PUBLIC.includes(path)) assert.ok(issued, `${path} é pública`);
    else assert.equal(issued, null, `${path} emitiu código sem sessão`);
  }
});

test('a rota de emissão responde 401 VAULT_LOCKED quando falta sessão', async () => {
  const route = await read('src/app/api/action-codes/route.ts');
  assert.match(route, /issueActionCode\(parsed\.data\.method, parsed\.data\.path, readSessionToken\(request\)\)/);
  assert.match(route, /VAULT_LOCKED[\s\S]{0,160}status: 401/);
});

test('código emitido com sessão deixa de valer quando o cofre bloqueia', async () => {
  await session.resetVaultRuntime();
  const token = session.unlockWith(randomBytes(32), 10);
  assert.equal(actionCodes.issueActionCode('GET', '/api/dashboard', 'token-que-nao-existe-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), null);

  const used = actionCodes.issueActionCode('GET', '/api/dashboard', token);
  assert.ok(used);
  assert.equal(actionCodes.consumeActionCode(used.actionCode, 'GET', '/api/dashboard', token), true);
  assert.equal(actionCodes.consumeActionCode(used.actionCode, 'GET', '/api/dashboard', token), false, 'uso único');

  const pending = actionCodes.issueActionCode('GET', '/api/dashboard', token);
  await session.lock();
  assert.equal(actionCodes.consumeActionCode(pending.actionCode, 'GET', '/api/dashboard', token), false, 'sessão encerrada no meio');
  assert.equal(session.sessionIsValid(token), false);
});

test('cookie de sessão: HttpOnly, SameSite=Strict, caminho /, nome por porta e Secure só em HTTPS', () => {
  const local = new Request('http://127.0.0.1:3210/api/vault/unlock', { headers: { host: '127.0.0.1:3210' } });
  const cookie = session.sessionCookie(local, 'a'.repeat(43));
  assert.match(cookie, /^talentum-session-3210=a{43}; Path=\/; HttpOnly; SameSite=Strict$/);
  const tls = new Request('https://127.0.0.1/api/vault/unlock', { headers: { host: '127.0.0.1' } });
  assert.match(session.sessionCookie(tls, 'a'.repeat(43)), /; Secure$/);
  assert.match(session.sessionCookie(local, null), /Max-Age=0$/);

  const withCookie = new Request('http://127.0.0.1:3210/api/x', { headers: { host: '127.0.0.1:3210', cookie: `talentum-session-3000=${'b'.repeat(43)}; talentum-session-3210=${'c'.repeat(43)}` } });
  assert.equal(session.readSessionToken(withCookie), 'c'.repeat(43), 'lê só o cookie da própria porta');
  const malformed = new Request('http://127.0.0.1:3210/api/x', { headers: { host: '127.0.0.1:3210', cookie: 'talentum-session-3210=<script>' } });
  assert.equal(session.readSessionToken(malformed), null);
});
