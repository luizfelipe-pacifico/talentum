import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Regressões encontradas no teste manual da LP com o Worker fora do ar:
   /api/auth/start, logout e concessão de download respondiam 500, e o logout
   deixava os cookies de sessão no navegador. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const { fetchWorker } = await import(new URL('apps/web/src/server/worker-fetch.ts', root).href);

test('Worker inacessível vira 503 controlado, não exceção', async () => {
  const offline = async () => {
    throw new TypeError('fetch failed');
  };
  const response = await fetchWorker('http://127.0.0.1:1/api/me', {}, offline);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'WORKER_UNAVAILABLE' } });
});

test('Worker acessível devolve a resposta original', async () => {
  const online = async () => new Response('{"ok":true}', { status: 200 });
  const response = await fetchWorker('http://worker.test/health', {}, online);
  assert.equal(response.status, 200);
});

test('o BFF chama o Worker somente por fetchWorker', async () => {
  const bff = await read('apps/web/src/server/cloudflare.ts');
  assert.match(bff, /fetchWorker\(/);
  assert.doesNotMatch(bff, /(?<![A-Za-z])fetch\(`/);
});

test('logout apaga os cookies mesmo quando o Worker falha', async () => {
  const logout = await read('apps/web/src/app/api/auth/logout/route.ts');
  // A revogação remota é tentada, mas a limpeza local não depende dela.
  assert.match(logout, /try\s*\{[\s\S]*cloud\('\/api\/auth\/logout'[\s\S]*\}\s*catch/);
  assert.match(logout, /cookies\.delete\(ACCESS_COOKIE\)[\s\S]*cookies\.delete\(REFRESH_COOKIE\)/);
});

test('concessão de download sem formulário responde 400, não 500', async () => {
  const grant = await read('apps/web/src/app/api/releases/[releaseId]/download-grants/route.ts');
  assert.match(grant, /formData\(\)\.catch\(/);
  assert.match(grant, /status:400/);
});

test('a LP avisa quando o login falha ou é cancelado', async () => {
  const page = await read('apps/web/src/app/page.tsx');
  assert.match(page, /searchParams/);
  const notice = await read('apps/web/src/components/lp/auth-notice.tsx');
  for (const kind of ['erro', 'cancelado']) assert.match(notice, new RegExp(`${kind}:`));
  assert.match(notice, /role="status"/);
});

test('BFF sem endereço do Worker configurado responde 503, não lança', async () => {
  const { workerBaseUrl } = await import(new URL('apps/web/src/server/worker-fetch.ts', root).href);
  assert.equal(workerBaseUrl(undefined), null);
  assert.equal(workerBaseUrl(''), null);
  assert.equal(workerBaseUrl('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787');
  const bff = await read('apps/web/src/server/cloudflare.ts');
  assert.doesNotMatch(bff, /throw new Error/);
});

test('a LP lê o .env único da raiz também quando roda de dentro de apps/web', async () => {
  // docs/BEST_PRACTICES.md: um só .env, na raiz. `next dev` em apps/web só
  // enxergava apps/web/.env e o BFF ficava sem configuração.
  const config = await read('apps/web/next.config.ts');
  assert.match(config, /process\.loadEnvFile\(rootEnv\)/);
  assert.match(config, /resolve\(__dirname, '\.\.', '\.\.', '\.env'\)/);
});

test('host e container usam endereços próprios para o Worker', async () => {
  // Um único CLOUDFLARE_API_BASE_URL servia o container (host.docker.internal)
  // e o `next dev` no host, onde esse nome não resolve: o login falhava.
  const compose = await read('compose.yaml');
  assert.match(compose, /CLOUDFLARE_API_BASE_URL: \$\{DOCKER_CLOUDFLARE_API_BASE_URL:-http:\/\/host\.docker\.internal:8787\}/);
  const example = await read('.env.example');
  assert.match(example, /^CLOUDFLARE_API_BASE_URL="http:\/\/127\.0\.0\.1:8787"$/m);
  assert.match(example, /^DOCKER_CLOUDFLARE_API_BASE_URL="http:\/\/host\.docker\.internal:8787"$/m);
});

test('o Worker local devolve o login para a LP local, não para produção', async () => {
  // Sem sobrescrita em .dev.vars, `wrangler dev` usava o PUBLIC_WEB_URL de
  // produção do wrangler.jsonc e o callback do Google saía do ambiente local.
  const example = await read('cloudflare/.dev.vars.example');
  assert.match(example, /^PUBLIC_WEB_URL=http:\/\/localhost:3100$/m);
  assert.match(example, /^ALLOWED_ORIGIN=http:\/\/localhost:3100$/m);
});
