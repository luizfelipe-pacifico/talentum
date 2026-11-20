import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createWorker, LEGAL } from './helpers/worker.mjs';

/* Verificação em duas etapas (TOTP, RFC 6238) e login do app desktop
   (cliente público nativo, RFC 8252) no Worker. */

const totp = await import(new URL('../../cloudflare/src/mfa/totp.ts', import.meta.url).href);
const ascii = (text) => new TextEncoder().encode(text);

test('TOTP confere com os vetores do RFC 6238 (SHA-1, SHA-256 e SHA-512, 8 dígitos)', async () => {
  const sha1 = ascii('12345678901234567890');
  const sha256 = ascii('12345678901234567890123456789012');
  const sha512 = ascii('1234567890123456789012345678901234567890123456789012345678901234');
  const vectors = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [time, one, two, five] of vectors) {
    assert.equal(await totp.totp(sha1, time, 8, 'SHA-1'), one, `SHA-1 ${time}`);
    assert.equal(await totp.totp(sha256, time, 8, 'SHA-256'), two, `SHA-256 ${time}`);
    assert.equal(await totp.totp(sha512, time, 8, 'SHA-512'), five, `SHA-512 ${time}`);
  }
  assert.deepEqual(totp.base32Decode(totp.base32Encode(sha1)), sha1);
});

async function enroll(ctx, auth) {
  assert.equal((await ctx.call('POST', '/api/me/mfa/totp/enroll', { body: {}, headers: auth })).status, 200);
  const pending = await (await ctx.call('GET', '/api/me/mfa/totp/pending', { headers: auth })).json();
  assert.match(pending.otpauthUri, /^otpauth:\/\/totp\/Talentum%3A/);
  const secret = totp.base32Decode(pending.secret);
  const now = Math.floor(Date.now() / 1000);
  const activate = await ctx.call('POST', '/api/me/mfa/totp/activate', { body: { code: await totp.totp(secret, now) }, headers: auth });
  assert.equal(activate.status, 200);
  return secret;
}

test('ativação: segredo cifrado no D1, códigos de recuperação exibidos uma vez e guardados só como hash', async () => {
  const ctx = await createWorker();
  const a = await ctx.session();
  const secret = await enroll(ctx, a.auth);
  const row = ctx.env.DB.raw.prepare('SELECT secret_ciphertext,status FROM mfa_totp').get();
  assert.equal(row.status, 'ACTIVE');
  assert.ok(!row.secret_ciphertext.includes(totp.base32Encode(secret)), 'segredo nunca em claro');
  const reveal = await (await ctx.call('POST', '/api/me/mfa/recovery-codes/reveal', { body: {}, headers: a.auth })).json();
  assert.equal(reveal.recoveryCodes.length, 10);
  assert.ok(reveal.recoveryCodes.every((code) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)));
  assert.equal((await ctx.call('POST', '/api/me/mfa/recovery-codes/reveal', { body: {}, headers: a.auth })).status, 404, 'segunda exibição recusada');
  const dump = JSON.stringify(ctx.env.DB.raw.prepare('SELECT * FROM mfa_recovery_codes').all());
  for (const code of reveal.recoveryCodes) assert.ok(!dump.includes(code));
  assert.equal((await ctx.call('POST', '/api/me/mfa/totp/enroll', { body: {}, headers: a.auth })).status, 409);
  assert.equal((await ctx.call('GET', '/api/me/mfa/totp/pending', { headers: a.auth })).status, 404, 'segredo ativo não é exibido de novo');
});

test('ativação exige o primeiro código válido; sem chave de cifra a verificação fica indisponível', async () => {
  const ctx = await createWorker();
  const a = await ctx.session();
  await ctx.call('POST', '/api/me/mfa/totp/enroll', { body: {}, headers: a.auth });
  assert.equal((await ctx.call('POST', '/api/me/mfa/totp/activate', { body: { code: '000000' }, headers: a.auth })).status, 400);
  assert.equal(ctx.env.DB.raw.prepare('SELECT status FROM mfa_totp').get().status, 'PENDING');
  const off = await createWorker({ env: { MFA_ENCRYPTION_KEY: '' } });
  const b = await off.session();
  assert.equal((await off.call('POST', '/api/me/mfa/totp/enroll', { body: {}, headers: b.auth })).status, 503);
});

test('login com verificação ativa: sessão só depois do código; o mesmo código não vale duas vezes', async () => {
  const ctx = await createWorker();
  const first = await ctx.login();
  const auth = { Authorization: `Bearer ${first.accessToken}` };
  const secret = await enroll(ctx, auth);

  const pending = await ctx.login();
  assert.equal(pending.mfaRequired, true);
  assert.equal(pending.accessToken, undefined, 'nenhum token antes do código');
  const sessions = ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n;

  // O código usado na ativação já consumiu o passo atual: repeti-lo é recusado.
  const now = Math.floor(Date.now() / 1000);
  const replay = await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: pending.mfaToken, code: await totp.totp(secret, now) } });
  assert.equal((await replay.json()).error.code, 'INVALID_MFA_CODE');
  assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, sessions);

  // Próximo passo (+30 s, dentro da janela de ±1): aceito uma única vez.
  const next = await totp.totp(secret, now + 30);
  const ok = await (await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: pending.mfaToken, code: next } })).json();
  assert.ok(ok.accessToken);
  const again = await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: pending.mfaToken, code: next } });
  assert.equal((await again.json()).error.code, 'MFA_CHALLENGE_EXPIRED', 'estado pendente é de uso único');
});

test('estado pendente expira e código de recuperação vale uma vez', async () => {
  const ctx = await createWorker();
  const first = await ctx.login();
  const auth = { Authorization: `Bearer ${first.accessToken}` };
  await enroll(ctx, auth);
  const { recoveryCodes } = await (await ctx.call('POST', '/api/me/mfa/recovery-codes/reveal', { body: {}, headers: auth })).json();

  const expired = await ctx.login();
  ctx.env.DB.raw.prepare('UPDATE mfa_challenges SET expires_at=?').run(new Date(Date.now() - 1000).toISOString());
  const late = await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: expired.mfaToken, recoveryCode: recoveryCodes[0] } });
  assert.equal((await late.json()).error.code, 'MFA_CHALLENGE_EXPIRED');

  const p1 = await ctx.login();
  assert.ok((await (await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: p1.mfaToken, recoveryCode: recoveryCodes[0] } })).json()).accessToken);
  const p2 = await ctx.login();
  const reused = await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: p2.mfaToken, recoveryCode: recoveryCodes[0] } });
  assert.equal(reused.status, 400);
  assert.equal(ctx.env.DB.raw.prepare("SELECT COUNT(*) n FROM security_events WHERE event_type='MFA_RECOVERY_CODE_USED'").get().n, 1);
});

test('bloqueio: 5 códigos errados bloqueiam a conta, inclusive para o código certo, e geram evento', async () => {
  const ctx = await createWorker();
  const first = await ctx.login();
  const auth = { Authorization: `Bearer ${first.accessToken}` };
  const secret = await enroll(ctx, auth);
  for (let i = 0; i < 5; i += 1) {
    const p = await ctx.login();
    await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: p.mfaToken, code: '000000' } });
  }
  const p = await ctx.login();
  const right = await totp.totp(secret, Math.floor(Date.now() / 1000) + 30);
  const locked = await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: p.mfaToken, code: right } });
  assert.equal((await locked.json()).error.code, 'MFA_LOCKED');
  const events = ctx.env.DB.raw.prepare("SELECT event_type FROM security_events WHERE event_type IN ('MFA_LOCKOUT','MFA_VERIFY')").all();
  assert.ok(events.some((e) => e.event_type === 'MFA_LOCKOUT'));
});

test('cinco erros no mesmo desafio encerram o desafio', async () => {
  const ctx = await createWorker();
  const first = await ctx.login();
  await enroll(ctx, { Authorization: `Bearer ${first.accessToken}` });
  const p = await ctx.login();
  // Libera o bloqueio por conta para isolar o limite por desafio.
  for (let i = 0; i < 5; i += 1) {
    ctx.env.DB.raw.prepare('UPDATE mfa_totp SET failed_attempts=0,locked_until=NULL').run();
    await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: p.mfaToken, code: '000000' } });
  }
  const after = await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: p.mfaToken, code: '000000' } });
  assert.equal((await after.json()).error.code, 'MFA_CHALLENGE_EXPIRED');
});

test('desativar exige um código atual e registra o evento', async () => {
  const ctx = await createWorker();
  const a = await ctx.session();
  const secret = await enroll(ctx, a.auth);
  assert.equal((await ctx.call('POST', '/api/me/mfa/totp/disable', { body: {}, headers: a.auth })).status, 400);
  const code = await totp.totp(secret, Math.floor(Date.now() / 1000) + 30);
  assert.equal((await ctx.call('POST', '/api/me/mfa/totp/disable', { body: { code }, headers: a.auth })).status, 200);
  assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM mfa_totp').get().n, 0);
  assert.equal(ctx.env.DB.raw.prepare("SELECT COUNT(*) n FROM security_events WHERE event_type='MFA_DISABLED'").get().n, 1);
});

/* --- Desktop ------------------------------------------------------------- */

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};
const desktopBody = (overrides = {}) => {
  const { challenge } = pkce();
  return {
    redirectUri: 'http://127.0.0.1:53123/callback',
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    state: 'estado-sintetico-do-app-0001',
    consent: LEGAL,
    ...overrides,
  };
};

test('desktop: só loopback de IP literal, porta explícita e caminho /callback', async () => {
  const ctx = await createWorker();
  for (const redirectUri of [
    'http://localhost:53123/callback',
    'https://127.0.0.1:53123/callback',
    'http://127.0.0.1/callback',
    'http://127.0.0.1:53123/outro',
    'http://ataque.example:53123/callback',
    'http://127.0.0.1:53123/callback?x=1',
    'http://127.0.0.1:80/callback',
    'http://user:pw@127.0.0.1:53123/callback',
  ]) {
    // IP distinto por tentativa: o teste é da validação, não do rate limit de 10 por minuto.
    const headers = { 'CF-Connecting-IP': `192.0.2.${redirectUri.length}` };
    const response = await ctx.callPublic('POST', '/api/desktop/auth/start', { body: desktopBody({ redirectUri }), headers });
    assert.equal((await response.json()).error?.code, 'INVALID_REDIRECT_URI', redirectUri);
  }
  assert.equal((await ctx.callPublic('POST', '/api/desktop/auth/start', { body: desktopBody({ codeChallengeMethod: 'plain' }) })).status, 400);
  assert.equal((await ctx.callPublic('POST', '/api/desktop/auth/start', { body: desktopBody({ consent: undefined }) })).status, 400);
  assert.equal((await ctx.callPublic('POST', '/api/desktop/auth/start', { body: desktopBody({ redirectUri: 'http://[::1]:53123/callback' }), headers: { 'CF-Connecting-IP': '192.0.2.200' } })).status, 200);
  let last = 0;
  for (let i = 0; i < 11; i += 1) last = (await ctx.callPublic('POST', '/api/desktop/auth/start', { body: desktopBody(), headers: { 'CF-Connecting-IP': '192.0.2.201' } })).status;
  assert.equal(last, 429, 'início do login do desktop tem rate limit por IP');
});

async function desktopLogin(ctx, { verifier, challenge } = pkce()) {
  const start = await (await ctx.callPublic('POST', '/api/desktop/auth/start', { body: desktopBody({ codeChallenge: challenge }) })).json();
  const signIn = new URL(start.signInUrl);
  assert.equal(`${signIn.origin}${signIn.pathname}`, 'http://localhost:3100/api/auth/desktop', 'o navegador começa pelo BFF da LP');
  const handoff = signIn.searchParams.get('handoff');
  const handed = await (await ctx.call('POST', '/api/auth/desktop/handoff', { body: { handoff } })).json();
  const replayed = await ctx.call('POST', '/api/auth/desktop/handoff', { body: { handoff } });
  assert.equal(replayed.status, 400, 'o valor de passagem é de uso único');
  const url = new URL(handed.authorizationUrl);
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3100/api/auth/callback', 'o Google volta sempre ao callback fixo da LP');
  ctx.providers.state.nonce = url.searchParams.get('nonce');
  const callback = await (await ctx.call('POST', '/api/auth/callback', { body: { code: 'codigo-sintetico', state: url.searchParams.get('state') } })).json();
  return { callback, verifier };
}

test('desktop: primeiro login cria a conta com aceite e entrega ao loopback um código trocado com PKCE', async () => {
  const ctx = await createWorker();
  const { callback, verifier } = await desktopLogin(ctx);
  const redirect = new URL(callback.desktopRedirect);
  assert.equal(`${redirect.origin}${redirect.pathname}`, 'http://127.0.0.1:53123/callback');
  assert.equal(redirect.searchParams.get('state'), 'estado-sintetico-do-app-0001');
  assert.equal(callback.accessToken, undefined, 'o navegador não recebe tokens do desktop');
  assert.equal(ctx.env.DB.raw.prepare('SELECT COUNT(*) n FROM consents').get().n, 2);

  const code = redirect.searchParams.get('code');
  const tokens = await (
    await ctx.callPublic('POST', '/api/desktop/auth/token', { body: { code, codeVerifier: verifier, redirectUri: 'http://127.0.0.1:53123/callback' } })
  ).json();
  assert.ok(tokens.accessToken && tokens.refreshToken);
  const replay = await ctx.callPublic('POST', '/api/desktop/auth/token', { body: { code, codeVerifier: verifier, redirectUri: 'http://127.0.0.1:53123/callback' } });
  assert.equal(replay.status, 400, 'código de uso único');

  const auth = { Authorization: `Bearer ${tokens.accessToken}` };
  assert.equal((await ctx.callPublic('GET', '/api/desktop/me', { headers: auth })).status, 200);
  assert.equal((await ctx.call('GET', '/api/me', { headers: auth })).status, 401, 'token do desktop não abre rota do BFF');
  assert.equal((await ctx.call('POST', '/api/auth/refresh', { body: { refreshToken: tokens.refreshToken } })).status, 401, 'refresh do desktop não roda no BFF');
  const rotated = await ctx.callPublic('POST', '/api/desktop/auth/refresh', { body: { refreshToken: tokens.refreshToken } });
  assert.equal(rotated.status, 200);
  const reuse = await ctx.callPublic('POST', '/api/desktop/auth/refresh', { body: { refreshToken: tokens.refreshToken } });
  assert.equal((await reuse.json()).error.code, 'REFRESH_REUSE_DETECTED');
});

test('desktop: verificador PKCE errado ou loopback diferente consomem o código e falham', async () => {
  const ctx = await createWorker();
  const { callback, verifier } = await desktopLogin(ctx);
  const code = new URL(callback.desktopRedirect).searchParams.get('code');
  const wrong = await ctx.callPublic('POST', '/api/desktop/auth/token', {
    body: { code, codeVerifier: pkce().verifier, redirectUri: 'http://127.0.0.1:53123/callback' },
  });
  assert.equal(wrong.status, 400);
  const right = await ctx.callPublic('POST', '/api/desktop/auth/token', { body: { code, codeVerifier: verifier, redirectUri: 'http://127.0.0.1:53123/callback' } });
  assert.equal(right.status, 400, 'depois de uma tentativa errada o código não vale mais');

  const second = await desktopLogin(ctx);
  const code2 = new URL(second.callback.desktopRedirect).searchParams.get('code');
  const otherPort = await ctx.callPublic('POST', '/api/desktop/auth/token', {
    body: { code: code2, codeVerifier: second.verifier, redirectUri: 'http://127.0.0.1:53124/callback' },
  });
  assert.equal(otherPort.status, 400);
});

test('desktop com verificação ativa: o código é pedido no navegador antes do loopback', async () => {
  const ctx = await createWorker();
  const web = await ctx.login();
  const secret = await enroll(ctx, { Authorization: `Bearer ${web.accessToken}` });
  const { callback } = await desktopLogin(ctx);
  assert.equal(callback.mfaRequired, true);
  assert.equal(callback.desktopRedirect, undefined);
  const code = await totp.totp(secret, Math.floor(Date.now() / 1000) + 30);
  const verified = await (await ctx.call('POST', '/api/auth/mfa/verify', { body: { mfaToken: callback.mfaToken, code } })).json();
  assert.match(verified.desktopRedirect, /^http:\/\/127\.0\.0\.1:53123\/callback\?code=/);
});
