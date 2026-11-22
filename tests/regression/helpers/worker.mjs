import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, createSign, generateKeyPairSync } from 'node:crypto';

/* D1 em memória sobre node:sqlite, com as migrations reais do Worker.

   Implementa só a superfície que `cloudflare/src/index.ts` usa: prepare, bind,
   run, first, all e batch. Assim os testes de regressão exercitam o Worker de
   verdade, em vez de procurar trechos no código-fonte. */

const root = new URL('../../../', import.meta.url);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes) } };
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }
}

export async function createD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('cloudflare/migrations/', root);
  for (const name of (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()) {
    db.exec(await readFile(new URL(name, dir), 'utf8'));
  }
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export const SECRETS = {
  APP_ENV: 'test',
  ALLOWED_ORIGIN: 'http://localhost:3100',
  PUBLIC_WEB_URL: 'http://localhost:3100',
  SESSION_SIGNING_SECRET: 'segredo-sintetico-de-sessao',
  TOKEN_HASH_PEPPER: 'pimenta-sintetica',
  BFF_SHARED_SECRET: 'segredo-sintetico-do-bff',
  GOOGLE_CLIENT_ID: 'cliente-sintetico.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'segredo-oauth-sintetico',
  MFA_ENCRYPTION_KEY: 'chave-sintetica-de-mfa-com-mais-de-32-caracteres',
};

/* Provedores externos falsos, servidos por um `fetch` injetado no escopo
   global durante o teste: Google (token + JWKS, ID token assinado em RS256 de
   verdade), Siteverify do Turnstile e qualquer rota extra do teste. Nada sai
   para a rede. */
export function createProviders() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'kid-sintetico', alg: 'RS256', use: 'sig' };
  const state = {
    nonce: null,
    sub: 'sub-sintetico-1',
    email: 'pessoa@exemplo.test',
    given_name: 'Pessoa',
    turnstile: { success: true, hostname: 'localhost', action: 'login' },
    turnstileCalls: 0,
    routes: new Map(),
  };
  const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  function idToken() {
    const header = b64url({ alg: 'RS256', kid: 'kid-sintetico', typ: 'JWT' });
    const payload = b64url({
      iss: 'https://accounts.google.com',
      aud: SECRETS.GOOGLE_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 600,
      nonce: state.nonce,
      sub: state.sub,
      email: state.email,
      email_verified: true,
      given_name: state.given_name,
    });
    const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey).toString('base64url');
    return `${header}.${payload}.${signature}`;
  }
  async function fetchMock(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ id_token: idToken() });
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      state.turnstileCalls += 1;
      return Response.json(state.turnstile);
    }
    for (const [prefix, handler] of state.routes) if (url.startsWith(prefix)) return handler(url, init);
    throw new TypeError(`rede bloqueada no teste: ${url}`);
  }
  return { state, fetchMock };
}

export async function createWorker({ env: overrides = {} } = {}) {
  const { default: worker } = await import(new URL('cloudflare/src/index.ts', root).href);
  const env = { ...SECRETS, ...overrides, DB: await createD1() };
  const providers = createProviders();
  globalThis.fetch = providers.fetchMock;

  async function send(method, path, { body, headers = {}, issuer = '/api/action-codes', bff = true } = {}) {
    const base = { 'Content-Type': 'application/json', ...(bff ? { 'X-Talentum-BFF': SECRETS.BFF_SHARED_SECRET } : {}), ...headers };
    const pathname = path.split('?')[0];
    const boot = await worker.fetch(
      new Request(`https://worker.test${issuer}`, { method: 'POST', headers: base, body: JSON.stringify({ method, path: pathname }) }),
      env,
    );
    if (!boot.ok) return boot;
    const { actionCode } = await boot.json();
    return worker.fetch(
      new Request(`https://worker.test${path}`, {
        method,
        headers: { ...base, 'X-Action-Code': actionCode },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
  }

  /* Chamada como o BFF faz: pede um código de ação e envia a requisição real. */
  const call = (method, path, options = {}) => send(method, path, options);
  /* Chamada como o backend local do app faz: código público, sem segredo do BFF. */
  const callPublic = (method, path, options = {}) => send(method, path, { ...options, issuer: '/api/public/action-codes', bff: false });

  /* Login web completo pelo Google falso; devolve o corpo do callback. */
  async function login({ email = 'pessoa@exemplo.test', sub = 'sub-sintetico-1', given = 'Pessoa' } = {}) {
    Object.assign(providers.state, { email, sub, given_name: given });
    const start = await call('POST', '/api/auth/start', { body: { consent: LEGAL, turnstileToken: 'token-sintetico-turnstile' } });
    const { authorizationUrl } = await start.json();
    const url = new URL(authorizationUrl);
    providers.state.nonce = url.searchParams.get('nonce');
    const response = await call('POST', '/api/auth/callback', { body: { code: 'codigo-sintetico', state: url.searchParams.get('state') } });
    return response.json();
  }

  /* Sessão pronta para uma pessoa nova, sem passar pelo Google. */
  async function session({ email, name = 'Pessoa', kind = 'WEB', moderator = false } = {}) {
    counter += 1;
    const n = counter;
    const userId = `u${n}`;
    const token = `token-sintetico-de-acesso-${n}-abcdefgh`;
    const t = new Date().toISOString();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const db = env.DB.raw;
    db.prepare("INSERT INTO users(id,email_normalized,status,email_verified_at,created_at,updated_at) VALUES(?,?,'ACTIVE',?,?,?)").run(userId, email ?? `p${n}@exemplo.test`, t, t, t);
    db.prepare('INSERT INTO user_profiles(id,user_id,public_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(`profile${n}`, userId, name, t, t);
    db.prepare('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at,created_at,client_kind) VALUES(?,?,?,?,?,?)').run(`s${n}`, userId, tokenHash(token), later, t, kind);
    if (moderator) db.prepare("INSERT INTO user_roles(id,user_id,role,granted_at) VALUES(?,?,'MODERATOR',?)").run(`role${n}`, userId, t);
    const auth = { Authorization: `Bearer ${token}` };
    return { userId, profileId: `profile${n}`, sessionId: `s${n}`, token, auth };
  }
  let counter = 0;

  return { worker, env, call, callPublic, login, session, providers };
}

export const LEGAL = { terms: '2026-11-20', privacy: '2026-11-21' };
export const tokenHash = (value) => createHash('sha256').update(`${SECRETS.TOKEN_HASH_PEPPER}:${value}`).digest('base64url');
