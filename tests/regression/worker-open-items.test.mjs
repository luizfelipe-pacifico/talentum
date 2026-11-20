import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, LEGAL, tokenHash } from './helpers/worker.mjs';

/* Regressões dos itens abertos do docs/SECURITY.md fechados na conclusão da
   trilha de nuvem. Cada teste descreve o ataque ou a falha que impede. */

test('CORS: origem estrangeira é recusada e a permitida não ganha credenciais nem o cabeçalho do BFF', async () => {
  const { worker, env } = await createWorker();
  const foreign = await worker.fetch(
    new Request('https://worker.test/api/action-codes', { method: 'OPTIONS', headers: { Origin: 'https://ataque.example' } }),
    env,
  );
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);

  const allowed = await worker.fetch(
    new Request('https://worker.test/api/action-codes', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3100' } }),
    env,
  );
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3100');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), null);
  assert.doesNotMatch(allowed.headers.get('Access-Control-Allow-Headers'), /X-Talentum-BFF/i);

  // Requisição comum vinda de um navegador em outro site: recusada antes de tudo.
  const post = await worker.fetch(
    new Request('https://worker.test/api/public/action-codes', {
      method: 'POST',
      headers: { Origin: 'https://ataque.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GET', path: '/api/news' }),
    }),
    env,
  );
  assert.equal(post.status, 403);
});

test('logout com access token expirado ainda revoga a família pelo refresh token (Open item 3)', async () => {
  const { env, call } = await createWorker();
  const db = env.DB.raw;
  const t = new Date().toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const later = new Date(Date.now() + 86_400_000).toISOString();
  db.exec(`INSERT INTO users(id,email_normalized,status,created_at,updated_at) VALUES('u1','a@exemplo.test','ACTIVE','${t}','${t}')`);
  db.exec(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,created_at) VALUES('s1','u1','x','${past}','${t}')`);
  db.exec(`INSERT INTO refresh_token_families(id,session_id,created_at) VALUES('f1','s1','${t}')`);
  db.prepare('INSERT INTO refresh_tokens(id,family_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').run('r1', 'f1', tokenHash('refresh-sintetico'), later, t);

  const response = await call('POST', '/api/auth/logout', { body: { refreshToken: 'refresh-sintetico' } });
  assert.equal(response.status, 200);
  assert.ok(db.prepare("SELECT revoked_at FROM refresh_token_families WHERE id='f1'").get().revoked_at);
  const again = await call('POST', '/api/auth/refresh', { body: { refreshToken: 'refresh-sintetico' } });
  assert.equal(again.status, 401, 'o refresh de uma sessão encerrada não renova');
});

test('reutilização de refresh token grava evento de segurança sem token, e-mail nem IP (Open item 13)', async () => {
  const { env, call, login } = await createWorker();
  const tokens = await login();
  const first = await call('POST', '/api/auth/refresh', { body: { refreshToken: tokens.refreshToken } });
  assert.equal(first.status, 200);
  const reuse = await call('POST', '/api/auth/refresh', {
    body: { refreshToken: tokens.refreshToken },
    headers: { 'X-Talentum-Client-IP': '198.51.100.23' },
  });
  assert.equal((await reuse.json()).error.code, 'REFRESH_REUSE_DETECTED');
  const events = env.DB.raw.prepare("SELECT * FROM security_events WHERE event_type='REFRESH_REUSE'").all();
  assert.equal(events.length, 1);
  assert.equal(events[0].risk_level, 'HIGH');
  const dump = JSON.stringify(env.DB.raw.prepare('SELECT * FROM security_events').all());
  assert.doesNotMatch(dump, /pessoa@exemplo\.test|198\.51\.100\.23/);
  assert.ok(!dump.includes(tokens.refreshToken));
});

test('concessão de download: uso único, da própria pessoa, curta e auditada (Open item 8)', async () => {
  const { env, call, session } = await createWorker();
  const a = await session();
  const b = await session();
  const t = new Date().toISOString();
  env.DB.raw.exec(`INSERT INTO releases(id,version,channel,status,published_at,created_at,updated_at) VALUES('rel1','0.1.0','STABLE','PUBLISHED','${t}','${t}','${t}')`);
  env.DB.raw.exec(
    `INSERT INTO release_artifacts(id,release_id,platform,architecture,download_url,sha256,created_at) VALUES('art1','rel1','LINUX','x64','https://github.com/exemplo/talentum/releases/download/v0.1.0/x.AppImage','abc','${t}')`,
  );
  const created = await call('POST', '/api/releases/rel1/download-grants', { body: { artifactId: 'art1' }, headers: a.auth });
  const { grant, expiresInSeconds } = await created.json();
  assert.equal(expiresInSeconds, 120);
  assert.equal(created.headers.get('Cache-Control'), 'no-store');

  const stolen = await call('POST', '/api/download-grants/redeem', { body: { grant }, headers: b.auth });
  assert.equal(stolen.status, 410, 'outra pessoa não resgata a concessão');
  const ok = await call('POST', '/api/download-grants/redeem', { body: { grant }, headers: a.auth });
  assert.equal((await ok.json()).downloadUrl.startsWith('https://github.com/'), true);
  const replay = await call('POST', '/api/download-grants/redeem', { body: { grant }, headers: a.auth });
  assert.equal(replay.status, 410, 'a segunda tentativa é recusada');
  const audit = env.DB.raw.prepare("SELECT action,outcome FROM audit_events WHERE action LIKE 'DOWNLOAD_GRANT%' ORDER BY created_at").all();
  assert.ok(audit.some((row) => row.action === 'DOWNLOAD_GRANT_CREATED'));
  assert.ok(audit.some((row) => row.action === 'DOWNLOAD_GRANT_REDEEMED' && row.outcome === 'SUCCESS'));
});

test('concessão vencida não é resgatada e endereço fora do GitHub é recusado', async () => {
  const { env, call, session } = await createWorker();
  const a = await session();
  const t = new Date().toISOString();
  env.DB.raw.exec(`INSERT INTO releases(id,version,channel,status,published_at,created_at,updated_at) VALUES('rel1','0.1.0','STABLE','PUBLISHED','${t}','${t}','${t}')`);
  env.DB.raw.exec(
    `INSERT INTO release_artifacts(id,release_id,platform,architecture,download_url,sha256,created_at) VALUES('art1','rel1','LINUX','x64','https://ataque.example/x','abc','${t}')`,
  );
  const { grant } = await (await call('POST', '/api/releases/rel1/download-grants', { body: { artifactId: 'art1' }, headers: a.auth })).json();
  const rejected = await call('POST', '/api/download-grants/redeem', { body: { grant }, headers: a.auth });
  assert.equal(rejected.status, 409);
  const { grant: late } = await (await call('POST', '/api/releases/rel1/download-grants', { body: { artifactId: 'art1' }, headers: a.auth })).json();
  env.DB.raw.prepare('UPDATE download_grants SET expires_at=? WHERE consumed_at IS NULL').run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await call('POST', '/api/download-grants/redeem', { body: { grant: late }, headers: a.auth })).status, 410);
});

test('rate limit por pessoa em concessões e por IP em callback e refresh (Open item 14)', async () => {
  const { call, session } = await createWorker();
  const a = await session();
  const statuses = [];
  for (let i = 0; i < 11; i += 1) statuses.push((await call('POST', '/api/releases/rel1/download-grants', { body: { artifactId: 'x' }, headers: a.auth })).status);
  assert.equal(statuses.at(-1), 429, 'a 11ª concessão em 10 minutos é recusada');

  const ip = { 'X-Talentum-Client-IP': '198.51.100.40' };
  let last = 0;
  for (let i = 0; i < 11; i += 1) last = (await call('POST', '/api/auth/callback', { body: { code: 'c', state: 's' }, headers: ip })).status;
  assert.equal(last, 429);
  for (let i = 0; i < 21; i += 1) last = (await call('POST', '/api/auth/refresh', { body: { refreshToken: 'x' }, headers: ip })).status;
  assert.equal(last, 429);
});

test('código público não serve para rota do BFF, e código do BFF não abre a rota pública por outro contexto', async () => {
  const { worker, env, callPublic } = await createWorker();
  // O emissor público recusa alvos que não são públicos.
  const refused = await worker.fetch(
    new Request('https://worker.test/api/public/action-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GET', path: '/api/me' }),
    }),
    env,
  );
  assert.equal(refused.status, 400);
  assert.equal((await callPublic('GET', '/api/news')).status, 200);
  // Sem BFF, a rota privada continua fechada mesmo com um código público de outra rota.
  const boot = await worker.fetch(
    new Request('https://worker.test/api/public/action-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'GET', path: '/api/news' }),
    }),
    env,
  );
  const { actionCode } = await boot.json();
  const me = await worker.fetch(new Request('https://worker.test/api/me', { headers: { 'X-Action-Code': actionCode } }), env);
  assert.equal(me.status, 403);
});

test('cron remove códigos, transações, janelas e sessões vencidas e mantém o que ainda vale (Open item 5)', async () => {
  const { env, call } = await createWorker();
  await call('POST', '/api/auth/start', { body: { consent: LEGAL } });
  const db = env.DB.raw;
  const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
  db.prepare('UPDATE action_codes SET expires_at=?').run(old);
  db.prepare('UPDATE auth_transactions SET expires_at=?').run(old);
  db.prepare('UPDATE rate_limit_windows SET window_started_at=?').run(old);
  db.exec(`INSERT INTO security_events(id,event_type,outcome,risk_level,created_at) VALUES('ev-velho','X','SUCCESS','LOW','${new Date(Date.now() - 200 * 86_400_000).toISOString()}')`);
  db.exec(`INSERT INTO security_events(id,event_type,outcome,risk_level,created_at) VALUES('ev-novo','X','SUCCESS','LOW','${new Date().toISOString()}')`);

  const { default: worker } = await import(new URL('../../cloudflare/src/index.ts', import.meta.url).href);
  const pending = [];
  await worker.scheduled({}, env, { waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);

  for (const table of ['action_codes', 'auth_transactions', 'rate_limit_windows']) {
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0, table);
  }
  assert.deepEqual(
    db.prepare('SELECT id FROM security_events ORDER BY id').all().map((row) => row.id),
    ['ev-novo'],
  );
});

test('início de login exige o aceite das versões vigentes', async () => {
  const { call } = await createWorker();
  const missing = await call('POST', '/api/auth/start', { body: {} });
  assert.equal((await missing.json()).error.code, 'CONSENT_REQUIRED');
  const old = await call('POST', '/api/auth/start', { body: { consent: { terms: '2020-01-01', privacy: LEGAL.privacy } } });
  assert.equal(old.status, 400);
});

test('Turnstile: em produção, sem chave secreta o login é recusado; com chave, só token válido para a ação e o host da LP', async () => {
  const prod = await createWorker({ env: { APP_ENV: 'production' } });
  const unavailable = await prod.call('POST', '/api/auth/start', { body: { consent: LEGAL, turnstileToken: 'token-sintetico-turnstile' } });
  assert.equal((await unavailable.json()).error.code, 'CHALLENGE_UNAVAILABLE');

  const { call, providers } = await createWorker({ env: { APP_ENV: 'production', TURNSTILE_SECRET_KEY: 'segredo-turnstile-sintetico' } });
  assert.equal((await call('POST', '/api/auth/start', { body: { consent: LEGAL } })).status, 403, 'sem token');
  providers.state.turnstile = { success: true, hostname: 'localhost', action: 'community' };
  assert.equal((await call('POST', '/api/auth/start', { body: { consent: LEGAL, turnstileToken: 'token-sintetico-turnstile' } })).status, 403, 'ação errada');
  providers.state.turnstile = { success: true, hostname: 'ataque.example', action: 'login' };
  assert.equal((await call('POST', '/api/auth/start', { body: { consent: LEGAL, turnstileToken: 'token-sintetico-turnstile' } })).status, 403, 'host errado');
  providers.state.turnstile = { success: true, hostname: 'localhost', action: 'login' };
  assert.equal((await call('POST', '/api/auth/start', { body: { consent: LEGAL, turnstileToken: 'token-sintetico-turnstile' } })).status, 200);
});

test('primeiro login cria conta, perfil com o primeiro nome e o aceite das duas versões', async () => {
  const { env, login } = await createWorker();
  const tokens = await login({ given: 'Ana' });
  assert.ok(tokens.accessToken);
  const consents = env.DB.raw.prepare('SELECT document_type,document_version FROM consents ORDER BY document_type').all();
  assert.deepEqual(
    consents.map((row) => [row.document_type, row.document_version]),
    [
      ['PRIVACY', LEGAL.privacy],
      ['TERMS', LEGAL.terms],
    ],
  );
  assert.equal(env.DB.raw.prepare('SELECT public_name FROM user_profiles').get().public_name, 'Ana');
  await login({ given: 'Ana' });
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM consents').get().n, 2, 'o mesmo aceite não duplica');
});

test('exclusão de conta encerra sessões, apaga identidade e transforma publicações em lápide', async () => {
  const { env, call, login } = await createWorker();
  const tokens = await login();
  const auth = { Authorization: `Bearer ${tokens.accessToken}` };
  const post = await call('POST', '/api/feedback/posts', {
    body: { title: 'Sugestão sintética', body: 'Texto sintético da sugestão para teste.' },
    headers: { ...auth, 'Idempotency-Key': 'chave-idem-0001' },
  });
  const { post: created } = await post.json();
  assert.equal((await call('DELETE', '/api/me', { body: {}, headers: auth })).status, 400, 'sem confirmação');
  assert.equal((await call('DELETE', '/api/me', { body: { confirm: 'EXCLUIR' }, headers: auth })).status, 200);

  const db = env.DB.raw;
  assert.equal(db.prepare('SELECT COUNT(*) n FROM oauth_identities').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_profiles').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM consents').get().n, 0);
  const user = db.prepare('SELECT status,email_normalized FROM users').get();
  assert.equal(user.status, 'DELETED');
  assert.doesNotMatch(user.email_normalized, /@/);
  const tomb = db.prepare('SELECT status,title,body FROM feedback_posts WHERE id=?').get(created.id);
  assert.deepEqual({ ...tomb }, { status: 'DELETED', title: '', body: '' });
  assert.equal((await call('GET', '/api/me', { headers: auth })).status, 401);
  const refreshed = await call('POST', '/api/auth/refresh', { body: { refreshToken: tokens.refreshToken } });
  assert.equal(refreshed.status, 401);
});

test('sessões: a pessoa lista e encerra só as próprias', async () => {
  const { call, login, session } = await createWorker();
  const tokens = await login();
  const other = await session();
  const auth = { Authorization: `Bearer ${tokens.accessToken}` };
  const list = await (await call('GET', '/api/me/sessions', { headers: auth })).json();
  assert.equal(list.sessions.length, 1);
  assert.equal(list.sessions[0].current, true);
  assert.equal((await call('DELETE', `/api/me/sessions/${other.sessionId}`, { headers: auth })).status, 404, 'sessão de outra pessoa');
  assert.equal((await call('GET', '/api/me', { headers: other.auth })).status, 200);
});

test('macOS é plataforma de release: artefato aceito pelo D1 e concessão resgatada como as outras', async () => {
  const { env, call, session } = await createWorker();
  const a = await session();
  const t = new Date().toISOString();
  env.DB.raw.exec(`INSERT INTO releases(id,version,channel,status,published_at,created_at,updated_at) VALUES('rel1','0.1.0','STABLE','PUBLISHED','${t}','${t}','${t}')`);
  env.DB.raw.exec(
    `INSERT INTO release_artifacts(id,release_id,platform,architecture,download_url,sha256,created_at) VALUES('mac1','rel1','MACOS','arm64','https://github.com/exemplo/talentum/releases/download/v0.1.0/x.dmg','abc','${t}')`,
  );
  assert.throws(() =>
    env.DB.raw.exec(`INSERT INTO release_artifacts(id,release_id,platform,architecture,download_url,sha256,created_at) VALUES('x','rel1','IOS','arm64','https://github.com/x','a','${t}')`),
  );
  const listed = await (await call('GET', '/api/releases', { headers: a.auth })).json();
  assert.equal(listed.releases[0].platform, 'MACOS');
  const { grant } = await (await call('POST', '/api/releases/rel1/download-grants', { body: { artifactId: 'mac1' }, headers: a.auth })).json();
  const redeemed = await call('POST', '/api/download-grants/redeem', { body: { grant }, headers: a.auth });
  assert.match((await redeemed.json()).downloadUrl, /\.dmg$/);
  assert.equal(env.DB.raw.prepare("SELECT metadata_json FROM audit_events WHERE action='DOWNLOAD_GRANT_REDEEMED'").get().metadata_json, '{"platform":"MACOS"}');
});
