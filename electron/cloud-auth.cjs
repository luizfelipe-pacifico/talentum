/* "Entrar com Google" no aplicativo para computador (docs/ARCHITECTURE.md §2.3,
   §3.5 "Desktop client" e §4.7).

   Cliente público nativo, como pede o RFC 8252 (OAuth 2.0 for Native Apps):
   - o login abre no navegador do sistema, nunca numa janela do Electron;
   - PKCE S256 e `state` aleatório por tentativa;
   - redirecionamento para um servidor de loopback em 127.0.0.1, porta
     aleatória, caminho `/callback`, que aceita uma única chamada e fecha;
   - nenhum segredo de cliente embutido.

   Fala direto com as rotas públicas do Worker (cloudflare/src/index.ts e
   cloudflare/src/auth.ts). Cada chamada leva um código de ação público novo,
   de uso único, emitido para o método e o caminho exatos.

   O token de atualização vai para o cofre de credenciais do sistema via
   `safeStorage` do Electron (Keychain no macOS, DPAPI no Windows, libsecret ou
   KWallet no Linux). Sem cofre de verdade (o backend `basic_text` do Linux),
   nada é gravado: a conexão dura até fechar o aplicativo. Nenhum token chega
   ao renderer, ao banco local nem ao localStorage.

   Entrar com Google NÃO abre o cofre local: não existe chave dos dados na
   nuvem. A conta serve para downloads, atualizações e comunidade.

   Isolado do main.cjs e com dependências injetadas para teste
   (tests/electron-cloud-auth.test.mjs). Os caminhos e os campos são o contrato
   do Worker; mudar um lado exige mudar o outro e §3.5. */

const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

/**
 * Endereço público do Worker para o app empacotado. Ainda não definido: o
 * Worker não tem domínio fixo (docs/ARCHITECTURE.md §6). Enquanto for `null`,
 * o app empacotado mostra a conta como indisponível em vez de chamar um
 * endereço errado.
 */
const DEFAULT_CLOUD_ORIGIN = null;

/** Rotas públicas do Worker (cloudflare/src/index.ts). */
const CLOUD_ENDPOINTS = Object.freeze({
  /** POST {method, path} -> {actionCode, expiresInSeconds: 60}; um código por chamada. */
  actionCodes: '/api/public/action-codes',
  /** POST {redirectUri, codeChallenge, codeChallengeMethod, state, consent} -> {signInUrl, expiresInSeconds}. */
  start: '/api/desktop/auth/start',
  /** POST {code, codeVerifier, redirectUri} -> par de tokens. */
  token: '/api/desktop/auth/token',
  /** POST {refreshToken} -> par novo (rotação; reuso revoga a família). */
  refresh: '/api/desktop/auth/refresh',
  /** POST {refreshToken} + Authorization: Bearer -> {ok: true}. */
  logout: '/api/desktop/auth/logout',
  /** GET + Authorization: Bearer -> {user: {profileId, publicName, isModerator, memberSince}}. */
  me: '/api/desktop/me',
});

/** Versões de Termos e Privacidade aceitas no login. Iguais a LEGAL_VERSIONS em cloudflare/src/env.ts. */
const LEGAL_VERSIONS = Object.freeze({ terms: '2026-11-20', privacy: '2026-11-21' });

/** Caminho fixo do loopback exigido pelo Worker (isLoopbackRedirect). */
const CALLBACK_PATH = '/callback';
/** O pedido de login vive 10 minutos no Worker; a espera local é menor. */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
/** Renova um pouco antes de o token de acesso expirar. */
const REFRESH_MARGIN_MS = 30_000;
const SESSION_FILE = 'talentum-cloud-session.bin';

/** Formato dos valores opacos do Worker (`rnd()` em base64url) e do `Bearer` que ele aceita. */
const OPAQUE = /^[A-Za-z0-9_-]{16,128}$/;

const base64url = (buffer) => buffer.toString('base64url');

/** Verificador de 43 caracteres (32 bytes) e desafio S256, como o Worker valida. */
function pkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

const isLoopbackHost = (hostname) => ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);

/** Só HTTPS; em desenvolvimento, também HTTP no loopback (Worker local). O app empacotado ignora o ambiente. */
function resolveCloudOrigin(requested, isPackaged) {
  if (isPackaged || !requested) return DEFAULT_CLOUD_ORIGIN;
  try {
    const url = new URL(requested);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHost(url.hostname))) return url.origin;
  } catch {
    /* valor inválido: fica o padrão */
  }
  return DEFAULT_CLOUD_ORIGIN;
}

const isOpaque = (value) => typeof value === 'string' && OPAQUE.test(value);
const isSeconds = (value, max) => Number.isInteger(value) && value > 0 && value <= max;

/** Valida a resposta de /token e /refresh; nada além do contrato é aceito. */
function parseTokenResponse(body) {
  if (!body || typeof body !== 'object') throw new Error('CLOUD_TOKEN_INVALID');
  const { accessToken, accessExpiresInSeconds, refreshToken, refreshExpiresInSeconds } = body;
  if (!isOpaque(accessToken) || !isOpaque(refreshToken)) throw new Error('CLOUD_TOKEN_INVALID');
  if (!isSeconds(accessExpiresInSeconds, 24 * 3600) || !isSeconds(refreshExpiresInSeconds, 400 * 24 * 3600))
    throw new Error('CLOUD_TOKEN_INVALID');
  return { accessToken, accessExpiresInSeconds, refreshToken, refreshExpiresInSeconds };
}

/**
 * Confere o `signInUrl` antes de entregá-lo ao `shell.openExternal`: só a página
 * do BFF (`/api/auth/desktop?handoff=…`) em HTTPS, ou em HTTP no loopback quando
 * o próprio Worker é local. Qualquer outro esquema ou caminho é recusado.
 */
function parseSignInUrl(value, cloudOrigin) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CLOUD_START_INVALID');
  }
  const localCloud = new URL(cloudOrigin).protocol === 'http:';
  const schemeOk = url.protocol === 'https:' || (localCloud && url.protocol === 'http:' && isLoopbackHost(url.hostname));
  const params = [...url.searchParams.keys()];
  if (
    !schemeOk ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.pathname !== '/api/auth/desktop' ||
    params.length !== 1 ||
    params[0] !== 'handoff' ||
    !isOpaque(url.searchParams.get('handoff'))
  )
    throw new Error('CLOUD_START_INVALID');
  return url.href;
}

const CALLBACK_PAGE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Talentum</title></head><body style="font-family:system-ui,sans-serif;background:#f4f1ea;color:#1a110a;display:grid;place-items:center;min-height:90vh"><main><h1 style="font-size:20px">Login concluído</h1><p>Pode fechar esta aba e voltar para o Talentum.</p></main></body></html>`;
const CALLBACK_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'Referrer-Policy': 'no-referrer',
};

/**
 * Servidor de loopback de uso único em `http://127.0.0.1:<porta>/callback`.
 * O Worker devolve o navegador com `?code=<código de 60 s>&state=<o state do app>`.
 * Resolve com o `code` quando o `state` confere; `state` ausente ou diferente
 * recebe 400 e a espera continua (um site não consegue injetar um código).
 */
function listenForCallback(state, timeoutMs) {
  return new Promise((resolveListen, rejectListen) => {
    let settle;
    const done = new Promise((resolveDone, rejectDone) => {
      settle = { resolve: resolveDone, reject: rejectDone };
    });
    // Quem aguarda recebe a falha; aqui só evita rejeição sem tratamento quando ninguém aguarda.
    done.catch(() => undefined);
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
        response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
        return;
      }
      const returned = url.searchParams.get('state');
      if (!returned || !sameSecret(returned, state)) {
        response.writeHead(400, { 'Cache-Control': 'no-store' }).end();
        return;
      }
      const code = url.searchParams.get('code');
      response.writeHead(200, CALLBACK_HEADERS).end(CALLBACK_PAGE);
      close();
      if (url.searchParams.has('error') || !isOpaque(code)) settle.reject(new Error('CLOUD_SIGN_IN_DENIED'));
      else settle.resolve(code);
    });
    const timer = setTimeout(() => {
      close();
      settle.reject(new Error('CLOUD_SIGN_IN_TIMEOUT'));
    }, timeoutMs);
    timer.unref?.();
    function close() {
      clearTimeout(timer);
      server.close();
      server.closeIdleConnections?.();
    }
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveListen({
        redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
        code: done,
        cancel: () => {
          close();
          settle.reject(new Error('CLOUD_SIGN_IN_CANCELLED'));
        },
      });
    });
  });
}

/**
 * Cria o cliente da conta Talentum.
 *
 * deps: { origin (URL do Worker ou null), userDataPath, safeStorage, openExternal, fetch, now, signInTimeoutMs }
 */
function createCloudAuth(deps) {
  const origin = deps.origin ?? null;
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  const file = path.join(deps.userDataPath, SESSION_FILE);
  let session = null; // { refreshToken, accessToken, accessExpiresAt, displayName }
  let loaded = false;
  let signInFlight = null;
  let refreshFlight = null;

  /** O sistema tem cofre de credenciais de verdade? No Linux, `basic_text` não conta. */
  function persistent() {
    try {
      if (!deps.safeStorage.isEncryptionAvailable()) return false;
      const backend = deps.safeStorage.getSelectedStorageBackend?.();
      return backend !== 'basic_text';
    } catch {
      return false;
    }
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    if (!persistent()) return;
    try {
      const sealed = await fs.readFile(file);
      const parsed = JSON.parse(deps.safeStorage.decryptString(sealed));
      if (isOpaque(parsed.refreshToken))
        session = {
          refreshToken: parsed.refreshToken,
          accessToken: null,
          accessExpiresAt: 0,
          displayName: typeof parsed.displayName === 'string' ? parsed.displayName.slice(0, 40) : null,
        };
    } catch {
      /* sem sessão salva, ou cofre do sistema trocado: segue desconectado */
    }
  }

  async function save() {
    if (!persistent() || !session) return;
    const sealed = deps.safeStorage.encryptString(JSON.stringify({ refreshToken: session.refreshToken, displayName: session.displayName }));
    const temporary = `${file}.${base64url(randomBytes(6))}.tmp`;
    await fs.writeFile(temporary, sealed, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, file);
  }

  async function forget() {
    session = null;
    await fs.rm(file, { force: true });
  }

  /** Código de ação público, novo a cada chamada: o Worker o consome para este método e caminho. */
  async function actionCode(method, endpoint) {
    const issued = await fetchImpl(`${origin}${CLOUD_ENDPOINTS.actionCodes}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, path: endpoint }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!issued.ok) throw new Error('CLOUD_ACTION_CODE_FAILED');
    const { actionCode: code } = await issued.json();
    if (!isOpaque(code)) throw new Error('CLOUD_ACTION_CODE_FAILED');
    return code;
  }

  async function call(method, endpoint, { body, bearer } = {}) {
    if (!origin) throw new Error('CLOUD_NOT_CONFIGURED');
    const headers = { 'X-Action-Code': await actionCode(method, endpoint) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const response = await fetchImpl(`${origin}${endpoint}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!response.ok) {
      const error = new Error('CLOUD_REQUEST_FAILED');
      error.status = response.status;
      const payload = await response.json().catch(() => null);
      if (typeof payload?.error?.code === 'string') error.code = payload.error.code.slice(0, 64);
      throw error;
    }
    return response.json();
  }

  function accept(tokens) {
    loaded = true; // a sessão em memória é a mais nova; não reler o arquivo por cima dela
    session = {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      accessExpiresAt: now() + tokens.accessExpiresInSeconds * 1000,
      displayName: session?.displayName ?? null,
    };
  }

  /** Nome público da conta (GET /api/desktop/me). Falhar aqui não desfaz o login. */
  async function fetchDisplayName(accessToken) {
    try {
      const { user } = await call('GET', CLOUD_ENDPOINTS.me, { bearer: accessToken });
      return typeof user?.publicName === 'string' ? user.publicName.slice(0, 40) : null;
    } catch {
      return null;
    }
  }

  /** Forma que o renderer recebe (src/types/electron.d.ts). Nunca traz token. */
  async function status() {
    if (!origin) return { available: false, connected: false, persistent: false, displayName: null };
    await load();
    return { available: true, connected: session !== null, persistent: persistent(), displayName: session?.displayName ?? null };
  }

  async function signIn() {
    if (!origin) throw new Error('CLOUD_NOT_CONFIGURED');
    if (signInFlight) return signInFlight;
    signInFlight = (async () => {
      const { verifier, challenge } = pkcePair();
      const state = base64url(randomBytes(16));
      const callback = await listenForCallback(state, deps.signInTimeoutMs ?? SIGN_IN_TIMEOUT_MS);
      try {
        // O aceite vale para as versões vigentes; o renderer mostra o texto antes de chamar signIn.
        const started = await call('POST', CLOUD_ENDPOINTS.start, {
          body: {
            redirectUri: callback.redirectUri,
            codeChallenge: challenge,
            codeChallengeMethod: 'S256',
            state,
            consent: { ...LEGAL_VERSIONS },
          },
        });
        await deps.openExternal(parseSignInUrl(started?.signInUrl, origin));
      } catch (error) {
        callback.cancel();
        throw error;
      }
      // O código vive 60 s no Worker e qualquer tentativa o consome: troca logo, uma vez.
      const code = await callback.code;
      const tokens = parseTokenResponse(
        await call('POST', CLOUD_ENDPOINTS.token, { body: { code, codeVerifier: verifier, redirectUri: callback.redirectUri } }),
      );
      session = null;
      accept(tokens);
      session.displayName = await fetchDisplayName(tokens.accessToken);
      await save();
      return status();
    })();
    try {
      return await signInFlight;
    } finally {
      signInFlight = null;
    }
  }

  /**
   * Rotação do token de atualização. Uma só por vez: duas rotações com o mesmo
   * token seriam reuso, e o Worker revogaria a família inteira.
   */
  function rotate() {
    refreshFlight ??= (async () => {
      const current = session;
      try {
        const tokens = parseTokenResponse(await call('POST', CLOUD_ENDPOINTS.refresh, { body: { refreshToken: current.refreshToken } }));
        if (session !== current) {
          // Saiu (ou entrou de novo) durante a rotação: o par novo não pode ressuscitar a sessão encerrada.
          await call('POST', CLOUD_ENDPOINTS.logout, { body: { refreshToken: tokens.refreshToken }, bearer: tokens.accessToken }).catch(
            () => undefined,
          );
          throw new Error('CLOUD_SIGNED_OUT');
        }
        accept(tokens);
        await save();
        return session.accessToken;
      } catch (error) {
        // Token recusado (expirado, revogado ou reusado): a conexão acaba, os dados locais ficam intactos.
        if ((error.status === 400 || error.status === 401) && session === current) await forget();
        throw error;
      }
    })().finally(() => {
      refreshFlight = null;
    });
    return refreshFlight;
  }

  /** Token de acesso válido, girando o de atualização quando preciso. Só o processo principal o vê. */
  async function accessToken() {
    if (!origin) return null;
    await load();
    if (!session) return null;
    if (session.accessToken && session.accessExpiresAt - REFRESH_MARGIN_MS > now()) return session.accessToken;
    return rotate();
  }

  async function signOut() {
    await load();
    const ended = session;
    await forget();
    if (ended && origin) {
      const live = ended.accessToken && ended.accessExpiresAt > now() ? ended.accessToken : undefined;
      // Melhor esforço: a cópia local já foi apagada; o Worker responde {ok: true} mesmo sem nada a revogar.
      await call('POST', CLOUD_ENDPOINTS.logout, { body: { refreshToken: ended.refreshToken }, bearer: live }).catch(() => undefined);
    }
    return status();
  }

  return { status, signIn, signOut, accessToken };
}

module.exports = {
  CALLBACK_PATH,
  CLOUD_ENDPOINTS,
  DEFAULT_CLOUD_ORIGIN,
  LEGAL_VERSIONS,
  createCloudAuth,
  parseSignInUrl,
  parseTokenResponse,
  pkcePair,
  resolveCloudOrigin,
};
