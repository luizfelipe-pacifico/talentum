import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWorker, SECRETS } from './helpers/worker.mjs';

/* Regressões do Worker de autenticação. Cada teste reproduz um defeito real
   encontrado na revisão de outubro de 2026. */

const tokenHash = (value) => createHash('sha256').update(`${SECRETS.TOKEN_HASH_PEPPER}:${value}`).digest('base64url');

function seedSession(db, refreshToken) {
  const t = new Date().toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  db.exec(`INSERT INTO users(id,email_normalized,status,email_verified_at,created_at,updated_at)
           VALUES('u1','pessoa@exemplo.test','ACTIVE','${t}','${t}','${t}')`);
  db.exec(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,created_at) VALUES('s1','u1','x','${later}','${t}')`);
  db.exec(`INSERT INTO refresh_token_families(id,session_id,created_at) VALUES('f1','s1','${t}')`);
  db.exec(`INSERT INTO refresh_tokens(id,family_id,token_hash,expires_at,created_at)
           VALUES('r1','f1','${tokenHash(refreshToken)}','${later}','${t}')`);
}

test('refresh concorrente com o mesmo token não gera dois sucessores válidos', async () => {
  const { env, call } = await createWorker();
  seedSession(env.DB.raw, 'refresh-sintetico');

  const [first, second] = await Promise.all([
    call('POST', '/api/auth/refresh', { body: { refreshToken: 'refresh-sintetico' } }),
    call('POST', '/api/auth/refresh', { body: { refreshToken: 'refresh-sintetico' } }),
  ]);

  const succeeded = [first, second].filter((response) => response.ok).length;
  assert.equal(succeeded, 1, 'só uma das duas renovações pode vencer a corrida');
  const live = env.DB.raw
    .prepare("SELECT COUNT(*) n FROM refresh_tokens WHERE family_id='f1' AND consumed_at IS NULL AND revoked_at IS NULL")
    .get().n;
  assert.equal(live, 1, 'a família termina com um único refresh token utilizável');
});

test('rate limit conta cada pessoa, não o IP do BFF que repassa todas', async () => {
  const { call } = await createWorker();
  // Todas as chamadas chegam do mesmo servidor do BFF; quem muda é a pessoa.
  const viaBff = (ip) => ({ headers: { 'CF-Connecting-IP': '203.0.113.10', 'X-Talentum-Client-IP': ip } });

  for (let i = 0; i < 10; i += 1) await call('POST', '/api/auth/start', viaBff('198.51.100.1'));
  const blocked = await call('POST', '/api/auth/start', viaBff('198.51.100.1'));
  const other = await call('POST', '/api/auth/start', viaBff('198.51.100.2'));

  assert.equal(blocked.status, 429, 'a mesma pessoa é limitada depois de 10 tentativas');
  assert.notEqual(other.status, 429, 'outra pessoa não herda o limite de quem esgotou o seu');
});

test('o IP informado pelo cliente só vale quando o BFF se autentica', async () => {
  const { worker, env } = await createWorker();
  // Sem o segredo do BFF a requisição é recusada antes de qualquer contagem.
  const response = await worker.fetch(
    new Request('https://worker.test/api/action-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Talentum-Client-IP': '198.51.100.9' },
      body: JSON.stringify({ method: 'POST', path: '/api/auth/start' }),
    }),
    env,
  );
  assert.equal(response.status, 403);
});
