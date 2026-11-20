import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/* Defeito (revisão ofensiva, 20/11/2026): um código de ação emitido para uma
   sessão era aceito numa requisição sem o cookie dessa sessão. O código é de
   uso único e dura 60 s, mas quem o capturasse (log, extensão, outro processo
   no loopback) o usava sem estar desbloqueado. A regra é que toda rota exija a
   sessão: o código só vale junto com o cookie da mesma sessão que o pediu. */

const root = new URL('../../', import.meta.url);
const actionCodes = await import(new URL('src/server/action-codes.ts', root).href);
const session = await import(new URL('src/server/vault/session.ts', root).href);

test('código de ação só vale com o cookie da sessão que o pediu', async () => {
  await session.resetVaultRuntime();
  const token = session.unlockWith(randomBytes(32), 10);
  const other = session.createSession();

  const withoutCookie = actionCodes.issueActionCode('GET', '/api/dashboard', token);
  assert.equal(actionCodes.consumeActionCode(withoutCookie.actionCode, 'GET', '/api/dashboard', null), false, 'sem cookie');

  const otherCookie = actionCodes.issueActionCode('GET', '/api/dashboard', token);
  assert.equal(actionCodes.consumeActionCode(otherCookie.actionCode, 'GET', '/api/dashboard', other), false, 'cookie de outra sessão');

  const same = actionCodes.issueActionCode('GET', '/api/dashboard', token);
  assert.equal(actionCodes.consumeActionCode(same.actionCode, 'GET', '/api/dashboard', token), true, 'mesma sessão');
  await session.lock();
});

test('toda chamada que consome código entrega o cookie da requisição', async () => {
  const callers = ['src/server/http.ts', 'src/app/api/dashboard/route.ts', 'src/app/api/dashboard/categories/route.ts', 'src/app/api/local-summary/route.ts', 'src/app/api/system/status/route.ts'];
  for (const file of callers) {
    const source = await readFile(new URL(file, root), 'utf8');
    const calls = [...source.matchAll(/consumeActionCode\(request[^\n]*/g)];
    assert.ok(calls.length > 0, `${file}: nenhuma chamada`);
    for (const call of calls) assert.match(call[0], /, path, readSessionToken\(request\)\)/, `${file}: ${call[0]}`);
  }
});
