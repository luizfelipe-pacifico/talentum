import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* "Entrar com Google" no app para computador (electron/cloud-auth.cjs), contra
   um Worker falso que reproduz o contrato real de cloudflare/src/index.ts e
   cloudflare/src/auth.ts (docs/ARCHITECTURE.md §3.5, "Desktop client"):
   código de ação público de uso único preso a método e caminho, start com
   loopback `/callback`, PKCE S256, `state` e aceite, código de 60 s entregue ao
   loopback, troca com o verificador, rotação com detecção de reuso, saída e
   /api/desktop/me. Tokens e códigos aqui são sintéticos. */

const require = createRequire(import.meta.url);
const cloudAuth = require('../electron/cloud-auth.cjs');
const ORIGIN = 'https://worker-sintetico.example';
const WEB = 'https://lp-sintetica.example';
const SESSION_FILE = 'talentum-cloud-session.bin';
const token = () => randomBytes(32).toString('base64url');

function fakeSafeStorage(backend = 'keychain') {
  return {
    isEncryptionAvailable: () => backend !== 'none',
    getSelectedStorageBackend: () => backend,
    encryptString: (text) => Buffer.from(`SEALED:${Buffer.from(text).toString('base64')}`),
    decryptString: (buffer) => Buffer.from(buffer.toString().replace(/^SEALED:/, ''), 'base64').toString(),
  };
}

const LOOPBACK = /^http:\/\/(127\.0\.0\.1|\[::1\]):(\d{4,5})\/callback$/;

/** Worker falso: mesmas rotas, campos, códigos de ação e regras de rotação do Worker real. */
function fakeWorker({ signInUrl } = {}) {
  const calls = [];
  const actionCodes = new Map(); // código -> `${method} ${path}`
  const requests = new Map(); // handoff -> pedido do desktop
  const codes = new Map(); // código do loopback -> pedido
  const sessions = new Map(); // access -> {family}
  const refreshTokens = new Map(); // refresh -> {family, consumed}
  const revokedFamilies = new Set();
  let family = 0;

  const issueSession = () => {
    family += 1;
    const access = token();
    const refresh = token();
    sessions.set(access, { family });
    refreshTokens.set(refresh, { family, consumed: false });
    return { accessToken: access, accessExpiresInSeconds: 900, refreshToken: refresh, refreshExpiresInSeconds: 2_592_000 };
  };
  const error = (code, status) => Response.json({ error: { code } }, { status });

  const fetch = async (url, init = {}) => {
    const { pathname, search } = new URL(url);
    const method = init.method ?? 'GET';
    const headers = init.headers ?? {};
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({
      method,
      pathname,
      search,
      body,
      actionCode: headers['X-Action-Code'] ?? null,
      authorization: headers.Authorization ?? null,
      redirect: init.redirect,
    });
    if (method === 'POST' && pathname === '/api/public/action-codes') {
      const publicRoutes = Object.values(cloudAuth.CLOUD_ENDPOINTS).filter((p) => p !== '/api/public/action-codes');
      if (!['GET', 'POST'].includes(body.method) || !publicRoutes.includes(body.path)) return error('INVALID_ACTION_TARGET', 400);
      const code = token();
      actionCodes.set(code, `${body.method} ${body.path}`);
      return Response.json({ actionCode: code, expiresInSeconds: 60 });
    }
    // Uso único e preso ao método e ao caminho, como consumeCode().
    const presented = headers['X-Action-Code'];
    if (actionCodes.get(presented) !== `${method} ${pathname}`) return error('INVALID_ACTION_CODE', 403);
    actionCodes.delete(presented);
    const bearer = headers.Authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,128})$/)?.[1] ?? null;

    if (method === 'POST' && pathname === '/api/desktop/auth/start') {
      if (!LOOPBACK.test(body.redirectUri ?? '')) return error('INVALID_REDIRECT_URI', 400);
      if (body.codeChallengeMethod !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(body.codeChallenge ?? ''))
        return error('INVALID_CODE_CHALLENGE', 400);
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(body.state ?? '')) return error('INVALID_STATE', 400);
      if (body.consent?.terms !== workerLegalVersions.terms || body.consent?.privacy !== workerLegalVersions.privacy)
        return error('CONSENT_REQUIRED', 400);
      const handoff = token();
      requests.set(handoff, { ...body });
      return Response.json({ signInUrl: signInUrl ?? `${WEB}/api/auth/desktop?handoff=${handoff}`, expiresInSeconds: 600 });
    }
    if (method === 'POST' && pathname === '/api/desktop/auth/token') {
      const request = codes.get(body.code);
      codes.delete(body.code); // qualquer tentativa consome o código
      if (!request || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.codeVerifier ?? '')) return error('INVALID_GRANT', 400);
      const challenge = createHash('sha256').update(body.codeVerifier).digest('base64url');
      if (challenge !== request.codeChallenge || body.redirectUri !== request.redirectUri) return error('INVALID_GRANT', 400);
      return Response.json(issueSession());
    }
    if (method === 'POST' && pathname === '/api/desktop/auth/refresh') {
      const old = refreshTokens.get(body.refreshToken);
      if (!old || revokedFamilies.has(old.family)) return error('INVALID_REFRESH', 401);
      if (old.consumed) {
        revokedFamilies.add(old.family);
        return error('REFRESH_REUSE_DETECTED', 401);
      }
      old.consumed = true;
      const access = token();
      const refresh = token();
      sessions.set(access, { family: old.family });
      refreshTokens.set(refresh, { family: old.family, consumed: false });
      return Response.json({ accessToken: access, accessExpiresInSeconds: 900, refreshToken: refresh, refreshExpiresInSeconds: 2_592_000 });
    }
    if (method === 'POST' && pathname === '/api/desktop/auth/logout') {
      const fromRefresh = refreshTokens.get(body?.refreshToken);
      if (fromRefresh) revokedFamilies.add(fromRefresh.family);
      if (bearer && sessions.get(bearer)) revokedFamilies.add(sessions.get(bearer).family);
      return Response.json({ ok: true });
    }
    if (method === 'GET' && pathname === '/api/desktop/me') {
      const session = bearer ? sessions.get(bearer) : null;
      if (!session || revokedFamilies.has(session.family)) return error('AUTH_REQUIRED', 401);
      return Response.json({
        user: {
          profileId: 'perfil-sintetico',
          publicName: 'Pessoa Sintética',
          isModerator: false,
          memberSince: '2026-11-20T00:00:00.000Z',
        },
      });
    }
    return error('NOT_FOUND', 404);
  };

  /** BFF + Google + callback: consome o handoff e devolve ao loopback com um código de uso único. */
  const completeInBrowser = (handoff) => {
    const request = requests.get(handoff);
    requests.delete(handoff);
    if (!request) return null;
    const code = token();
    codes.set(code, request);
    const target = new URL(request.redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', request.state);
    return target.href;
  };

  return { fetch, calls, completeInBrowser, refreshTokens, revokedFamilies };
}

/** Versões vigentes lidas do Worker: o app precisa enviar exatamente estas. */
const envSource = await readFile(new URL('../cloudflare/src/env.ts', import.meta.url), 'utf8');
const workerLegalVersions = (() => {
  const match = envSource.match(/LEGAL_VERSIONS\s*=\s*\{\s*terms:\s*'([^']+)',\s*privacy:\s*'([^']+)'\s*\}/);
  assert.ok(match, 'LEGAL_VERSIONS em cloudflare/src/env.ts');
  return { terms: match[1], privacy: match[2] };
})();

/** "Navegador do sistema": abre o signInUrl e segue o redirecionamento final até o loopback. */
function browser(worker, { tamperState = false, attackerFirst = false } = {}) {
  const opened = [];
  const openExternal = async (target) => {
    opened.push(target);
    const handoff = new URL(target).searchParams.get('handoff');
    const loopback = new URL(worker.completeInBrowser(handoff));
    if (attackerFirst) {
      const forged = await globalThis.fetch(`${loopback.origin}/callback?code=${token()}&state=state-de-outro-site`);
      assert.equal(forged.status, 400, 'state forjado é recusado sem encerrar a espera');
      const noState = await globalThis.fetch(`${loopback.origin}/callback?code=${token()}`);
      assert.equal(noState.status, 400, 'sem state também é recusado');
      const otherPath = await globalThis.fetch(`${loopback.origin}/oauth/callback?${loopback.searchParams}`);
      assert.equal(otherPath.status, 404, 'só o caminho /callback responde');
    }
    if (tamperState) loopback.searchParams.set('state', 'state-errado-aaaaaaaaaa');
    setTimeout(() => globalThis.fetch(loopback.href).catch(() => undefined), 10);
  };
  return { opened, openExternal };
}

async function setup(backend = 'keychain', options = {}) {
  const userDataPath = await mkdtemp(join(tmpdir(), 'talentum-cloud-'));
  const worker = options.worker ?? fakeWorker();
  const nav = browser(worker, options);
  const deps = {
    origin: ORIGIN,
    userDataPath,
    safeStorage: fakeSafeStorage(backend),
    openExternal: nav.openExternal,
    fetch: worker.fetch,
    signInTimeoutMs: options.timeout ?? 5000,
    ...(options.now ? { now: options.now } : {}),
  };
  return {
    auth: cloudAuth.createCloudAuth(deps),
    deps,
    worker,
    nav,
    userDataPath,
    cleanup: () => rm(userDataPath, { recursive: true, force: true }),
  };
}

test('os caminhos são as rotas públicas reais do Worker', async () => {
  const index = await readFile(new URL('../cloudflare/src/index.ts', import.meta.url), 'utf8');
  assert.match(index, /path === '\/api\/public\/action-codes'/);
  assert.equal(cloudAuth.CLOUD_ENDPOINTS.actionCodes, '/api/public/action-codes');
  for (const [method, key] of [
    ['POST', 'start'],
    ['POST', 'token'],
    ['POST', 'refresh'],
    ['POST', 'logout'],
    ['GET', 'me'],
  ]) {
    const route = cloudAuth.CLOUD_ENDPOINTS[key];
    assert.ok(
      index.includes(`{ method: '${method}', pattern: p('${route}')`) &&
        /public: true/.test(index.split(`p('${route}')`)[1].split('\n')[0]),
      `${method} ${route} é rota pública do Worker`,
    );
  }
  assert.deepEqual({ ...cloudAuth.LEGAL_VERSIONS }, workerLegalVersions, 'aceite igual a LEGAL_VERSIONS do Worker');
  assert.equal(cloudAuth.CALLBACK_PATH, '/callback');
});

test('login: start com loopback, PKCE S256, state e aceite; troca com o verificador; nome por /api/desktop/me', async () => {
  const { auth, worker, nav, userDataPath, cleanup } = await setup('keychain', { attackerFirst: true });
  const status = await auth.signIn();
  assert.deepEqual(status, { available: true, connected: true, persistent: true, displayName: 'Pessoa Sintética' });

  const routes = worker.calls
    .filter((call) => call.pathname !== cloudAuth.CLOUD_ENDPOINTS.actionCodes)
    .map((call) => `${call.method} ${call.pathname}`);
  assert.deepEqual(routes, ['POST /api/desktop/auth/start', 'POST /api/desktop/auth/token', 'GET /api/desktop/me']);

  const start = worker.calls.find((call) => call.pathname === '/api/desktop/auth/start').body;
  assert.match(start.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.equal(start.codeChallengeMethod, 'S256');
  assert.match(start.codeChallenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(start.state, /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(start.consent, workerLegalVersions);

  const exchange = worker.calls.find((call) => call.pathname === '/api/desktop/auth/token').body;
  assert.deepEqual(Object.keys(exchange).sort(), ['code', 'codeVerifier', 'redirectUri']);
  assert.equal(exchange.redirectUri, start.redirectUri, 'mesmo redirectUri do start');
  assert.equal(createHash('sha256').update(exchange.codeVerifier).digest('base64url'), start.codeChallenge);

  // Só a página do BFF foi aberta no navegador do sistema, nunca o Worker nem o Google direto.
  assert.equal(nav.opened.length, 1);
  assert.equal(new URL(nav.opened[0]).origin + new URL(nav.opened[0]).pathname, `${WEB}/api/auth/desktop`);

  // Cada chamada levou um código de ação novo, pedido para o método e o caminho exatos, e nada seguiu redirecionamento.
  const codeRequests = worker.calls.filter((call) => call.pathname === cloudAuth.CLOUD_ENDPOINTS.actionCodes);
  assert.equal(codeRequests.length, 3);
  assert.deepEqual(
    codeRequests.map((call) => `${call.body.method} ${call.body.path}`),
    routes,
  );
  const used = worker.calls.filter((call) => call.actionCode).map((call) => call.actionCode);
  assert.equal(new Set(used).size, used.length, 'nenhum código de ação reaproveitado');
  assert.ok(worker.calls.every((call) => call.redirect === 'error'));

  // O token de atualização só existe selado pelo safeStorage, com modo 0600; o estado não traz token.
  const file = join(userDataPath, SESSION_FILE);
  const sealed = await readFile(file, 'utf8');
  assert.match(sealed, /^SEALED:/);
  const { refreshToken } = JSON.parse(Buffer.from(sealed.replace(/^SEALED:/, ''), 'base64').toString());
  assert.ok(worker.refreshTokens.has(refreshToken));
  assert.ok(!sealed.includes(refreshToken), 'o arquivo não guarda o token em claro');
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
  const rendererView = JSON.stringify(await auth.status());
  assert.ok(!rendererView.includes(refreshToken) && !rendererView.includes(await auth.accessToken()), 'nenhum token chega ao renderer');
  await cleanup();
});

test('state diferente do enviado não conclui o login', async () => {
  const { auth, worker, cleanup } = await setup('keychain', { tamperState: true, timeout: 300 });
  await assert.rejects(auth.signIn(), /CLOUD_SIGN_IN_TIMEOUT/);
  assert.equal((await auth.status()).connected, false);
  assert.ok(!worker.calls.some((call) => call.pathname === '/api/desktop/auth/token'), 'sem state certo, o código não é trocado');
  await cleanup();
});

test('signInUrl fora do contrato não é aberto e o loopback fecha', async () => {
  for (const signInUrl of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'http://lp-sintetica.example/api/auth/desktop?handoff=aaaaaaaaaaaaaaaaaaaa',
    `${WEB}/outra?handoff=aaaaaaaaaaaaaaaaaaaa`,
    `${WEB}/api/auth/desktop?handoff=aaaaaaaaaaaaaaaaaaaa&next=x`,
  ]) {
    const { auth, nav, cleanup } = await setup('keychain', { worker: fakeWorker({ signInUrl }) });
    await assert.rejects(auth.signIn(), /CLOUD_START_INVALID/, signInUrl);
    assert.equal(nav.opened.length, 0, signInUrl);
    assert.equal((await auth.status()).connected, false);
    await cleanup();
  }
  assert.equal(
    cloudAuth.parseSignInUrl('http://127.0.0.1:3000/api/auth/desktop?handoff=aaaaaaaaaaaaaaaaaaaa', 'http://127.0.0.1:8787'),
    'http://127.0.0.1:3000/api/auth/desktop?handoff=aaaaaaaaaaaaaaaaaaaa',
    'HTTP só com Worker local',
  );
});

test('troca recusada pelo Worker não conecta', async () => {
  const worker = fakeWorker();
  const original = worker.completeInBrowser;
  worker.completeInBrowser = (handoff) => {
    const target = new URL(original(handoff));
    target.searchParams.set('code', token()); // código que o Worker não emitiu
    return target.href;
  };
  const { auth, cleanup } = await setup('keychain', { worker });
  await assert.rejects(auth.signIn(), (error) => error.status === 400 && error.code === 'INVALID_GRANT');
  assert.equal((await auth.status()).connected, false);
  await cleanup();
});

test('sem cofre de credenciais real (basic_text), nada é gravado em disco', async () => {
  const { auth, userDataPath, cleanup } = await setup('basic_text');
  const status = await auth.signIn();
  assert.equal(status.connected, true);
  assert.equal(status.persistent, false);
  await assert.rejects(stat(join(userDataPath, SESSION_FILE)), /ENOENT/);
  await cleanup();
});

test('rotação por /api/desktop/auth/refresh, uma por vez, e saída por /api/desktop/auth/logout', async () => {
  let clock = Date.now();
  const { auth, deps, worker, userDataPath, cleanup } = await setup('keychain', { now: () => clock });
  await auth.signIn();
  const first = await auth.accessToken();
  assert.equal(await auth.accessToken(), first, 'ainda válido: sem nova chamada');
  clock += 16 * 60_000;
  // Duas chamadas simultâneas: uma única rotação, senão o Worker veria reuso e revogaria a família.
  const [a, b] = await Promise.all([auth.accessToken(), auth.accessToken()]);
  assert.equal(a, b);
  assert.notEqual(a, first);
  const refreshes = worker.calls.filter((call) => call.pathname === '/api/desktop/auth/refresh');
  assert.equal(refreshes.length, 1);
  assert.deepEqual(Object.keys(refreshes[0].body), ['refreshToken']);
  assert.equal(worker.revokedFamilies.size, 0);

  // Um processo novo lê a sessão do arquivo selado, já com o token girado.
  const reopened = cloudAuth.createCloudAuth(deps);
  assert.equal((await reopened.status()).connected, true);
  const sealed = JSON.parse(
    Buffer.from((await readFile(join(userDataPath, SESSION_FILE), 'utf8')).replace(/^SEALED:/, ''), 'base64').toString(),
  );
  assert.equal(worker.refreshTokens.get(sealed.refreshToken)?.consumed, false, 'o arquivo guarda o token novo');

  const after = await reopened.signOut();
  assert.deepEqual(after, { available: true, connected: false, persistent: true, displayName: null });
  const logout = worker.calls.find((call) => call.pathname === '/api/desktop/auth/logout');
  assert.equal(logout.body.refreshToken, sealed.refreshToken);
  assert.equal(worker.revokedFamilies.size, 1, 'a família foi revogada no Worker');
  await assert.rejects(stat(join(userDataPath, SESSION_FILE)), /ENOENT/);
  await cleanup();
});

test('saída com token de acesso válido também o envia como Bearer', async () => {
  const { auth, worker, cleanup } = await setup();
  await auth.signIn();
  const access = await auth.accessToken();
  await auth.signOut();
  const logout = worker.calls.find((call) => call.pathname === '/api/desktop/auth/logout');
  assert.equal(logout.authorization, `Bearer ${access}`);
  assert.equal(await auth.accessToken(), null);
  await cleanup();
});

test('token de atualização recusado (reuso detectado) encerra a conexão local', async () => {
  let clock = Date.now();
  const { auth, worker, userDataPath, cleanup } = await setup('keychain', { now: () => clock });
  await auth.signIn();
  for (const entry of worker.refreshTokens.values()) entry.consumed = true; // outro processo já usou este token
  clock += 16 * 60_000;
  await assert.rejects(auth.accessToken(), (error) => error.status === 401 && error.code === 'REFRESH_REUSE_DETECTED');
  assert.equal((await auth.status()).connected, false);
  await assert.rejects(stat(join(userDataPath, SESSION_FILE)), /ENOENT/);
  await cleanup();
});

test('sem endereço do Worker a conta fica indisponível e nada é chamado', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'talentum-cloud-'));
  const calls = [];
  const auth = cloudAuth.createCloudAuth({
    origin: null,
    userDataPath,
    safeStorage: fakeSafeStorage(),
    openExternal: async () => calls.push('open'),
    fetch: async () => calls.push('fetch'),
  });
  assert.deepEqual(await auth.status(), { available: false, connected: false, persistent: false, displayName: null });
  await assert.rejects(auth.signIn(), /CLOUD_NOT_CONFIGURED/);
  assert.equal(await auth.accessToken(), null);
  assert.deepEqual(calls, []);
  await rm(userDataPath, { recursive: true, force: true });
});

test('resposta fora do contrato é recusada e a origem só aceita HTTPS ou loopback em desenvolvimento', () => {
  const valid = {
    accessToken: 'a'.repeat(43),
    accessExpiresInSeconds: 900,
    refreshToken: 'b'.repeat(64),
    refreshExpiresInSeconds: 2_592_000,
  };
  assert.deepEqual(cloudAuth.parseTokenResponse(valid), valid);
  assert.throws(() => cloudAuth.parseTokenResponse({ ...valid, accessToken: 'curto' }), /CLOUD_TOKEN_INVALID/);
  assert.throws(() => cloudAuth.parseTokenResponse({ ...valid, refreshToken: 'com espaço e caracteres inválidos' }), /CLOUD_TOKEN_INVALID/);
  assert.throws(() => cloudAuth.parseTokenResponse({ ...valid, accessExpiresInSeconds: -1 }), /CLOUD_TOKEN_INVALID/);
  assert.throws(
    () => cloudAuth.parseTokenResponse({ access_token: valid.accessToken, refresh_token: valid.refreshToken, expires_in: 900 }),
    /CLOUD_TOKEN_INVALID/,
    'formato antigo',
  );
  assert.equal(cloudAuth.resolveCloudOrigin('http://evil.example', false), cloudAuth.DEFAULT_CLOUD_ORIGIN);
  assert.equal(cloudAuth.resolveCloudOrigin('http://127.0.0.1:8787', false), 'http://127.0.0.1:8787');
  assert.equal(cloudAuth.resolveCloudOrigin('https://worker-sintetico.example/caminho', false), 'https://worker-sintetico.example');
  assert.equal(cloudAuth.resolveCloudOrigin('http://127.0.0.1:8787', true), cloudAuth.DEFAULT_CLOUD_ORIGIN, 'empacotado ignora o ambiente');
  const { verifier, challenge } = cloudAuth.pkcePair();
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
});
