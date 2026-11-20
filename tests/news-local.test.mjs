import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clearNewsCache, cloudBaseUrl, getNewsItem, listNews, summarizeNews } from '../src/server/cloud-news.ts';

/* Cliente local das notícias públicas do Worker (Etapas 15 e 16). Todas as
   respostas são sintéticas; nenhum teste toca a rede. */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const BASE = 'https://worker.exemplo.test';

const item = (overrides = {}) => ({
  id: 'noticia-sintetica-1',
  title: 'Título sintético de economia',
  url: 'https://agenciabrasil.ebc.com.br/economia/noticia/sintetica',
  excerpt: 'Trecho sintético da notícia.',
  publishedAt: '2026-11-20T12:00:00.000Z',
  source: {
    key: 'agencia-brasil-economia',
    name: 'Agência Brasil',
    homepage: 'https://agenciabrasil.ebc.com.br/economia',
    license: 'Reprodução permitida com crédito à Agência Brasil.',
  },
  ...overrides,
});

/** Worker falso: registra cada chamada e responde código de ação e conteúdo. */
function fakeWorker(respond) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === `${BASE}/api/public/action-codes`) {
      return Response.json({ actionCode: 'codigo-sintetico-de-acao-0123456789', expiresInSeconds: 60 });
    }
    return respond(url, init);
  };
  return { fetch, calls };
}

test.beforeEach(() => clearNewsCache());

test('sem endereço configurado as notícias ficam desativadas, sem chamada de rede', async () => {
  let called = false;
  const fetch = async () => {
    called = true;
    throw new Error('não deveria chamar');
  };
  assert.deepEqual(await listNews({ baseUrl: null, fetch }), { status: 'unconfigured' });
  assert.equal(cloudBaseUrl(''), null);
  assert.equal(cloudBaseUrl('   '), null);
  assert.equal(cloudBaseUrl(undefined), null);
  assert.equal(cloudBaseUrl('ftp://exemplo.test'), null);
  assert.equal(cloudBaseUrl('https://worker.exemplo.test/'), BASE);
  assert.equal(called, false);
});

test('Worker inacessível vira estado offline, não exceção', async () => {
  const fetch = async () => {
    throw new TypeError('fetch failed');
  };
  assert.deepEqual(await listNews({ baseUrl: BASE, fetch }), { status: 'offline' });
});

test('chamada que estoura o tempo vira offline', async () => {
  const fetch = async (_url, init) => {
    init.signal.throwIfAborted?.();
    const error = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    throw error;
  };
  assert.deepEqual(await listNews({ baseUrl: BASE, fetch }), { status: 'offline' });
});

test('usa o protocolo de código de ação e não repassa nada além do necessário', async () => {
  const { fetch, calls } = fakeWorker(() => Response.json({ items: [item()], updatedAt: '2026-11-20T12:05:00.000Z' }));
  const result = await listNews({ baseUrl: BASE, fetch });
  assert.equal(result.status, 'ok');
  assert.equal(result.items.length, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].init.body), { method: 'GET', path: '/api/news' });
  assert.equal(calls[1].url, `${BASE}/api/news`);
  const headers = calls[1].init.headers;
  assert.deepEqual(Object.keys(headers).sort(), ['Content-Type', 'X-Action-Code']);
  assert.equal(headers['X-Action-Code'], 'codigo-sintetico-de-acao-0123456789');
  assert.deepEqual(Object.keys(calls[0].init.headers), ['Content-Type']);
  assert.equal(calls[1].init.body, undefined, 'a leitura não leva corpo');
});

test('resposta fora do formato é recusada', async () => {
  const extra = fakeWorker(() => Response.json({ items: [{ ...item(), carteira: 'x' }], updatedAt: null }));
  assert.deepEqual(await listNews({ baseUrl: BASE, fetch: extra.fetch }), { status: 'offline' });
  clearNewsCache();
  const long = fakeWorker(() => Response.json({ items: [item({ excerpt: 'a'.repeat(301) })], updatedAt: null }));
  assert.deepEqual(await listNews({ baseUrl: BASE, fetch: long.fetch }), { status: 'offline' });
  clearNewsCache();
  const garbage = fakeWorker(() => new Response('<html>', { status: 200 }));
  assert.deepEqual(await listNews({ baseUrl: BASE, fetch: garbage.fetch }), { status: 'offline' });
});

test('link que não é https é recusado (javascript:, http:)', async () => {
  for (const url of ['javascript:alert(1)', 'http://agenciabrasil.ebc.com.br/x', 'nao-e-url']) {
    clearNewsCache();
    const { fetch } = fakeWorker(() => Response.json({ items: [item({ url })], updatedAt: null }));
    assert.deepEqual(await listNews({ baseUrl: BASE, fetch }), { status: 'offline' }, url);
  }
});

test('o cache de 5 minutos evita nova chamada e expira depois', async () => {
  let now = 1_000_000;
  const { fetch, calls } = fakeWorker(() => Response.json({ items: [item()], updatedAt: null }));
  await listNews({ baseUrl: BASE, fetch, now: () => now });
  await listNews({ baseUrl: BASE, fetch, now: () => now + 60_000 });
  assert.equal(calls.length, 2, 'segunda leitura veio do cache');
  now += 5 * 60_000 + 1;
  await listNews({ baseUrl: BASE, fetch, now: () => now });
  assert.equal(calls.length, 4, 'depois de 5 minutos busca de novo');
});

test('falha não fica em cache', async () => {
  let fail = true;
  const { fetch, calls } = fakeWorker(() => (fail ? new Response('{}', { status: 503 }) : Response.json({ items: [], updatedAt: null })));
  assert.deepEqual(await listNews({ baseUrl: BASE, fetch }), { status: 'offline' });
  fail = false;
  assert.equal((await listNews({ baseUrl: BASE, fetch })).status, 'ok');
  assert.equal(calls.length, 4);
});

test('notícia inexistente vira not_found e identificador inválido nem sai do computador', async () => {
  const { fetch, calls } = fakeWorker(() => Response.json({ error: { code: 'NEWS_NOT_FOUND' } }, { status: 404 }));
  assert.deepEqual(await getNewsItem('noticia-sintetica-2', { baseUrl: BASE, fetch }), { status: 'not_found' });
  const before = calls.length;
  assert.deepEqual(await getNewsItem('../api/me', { baseUrl: BASE, fetch }), { status: 'not_found' });
  assert.deepEqual(await summarizeNews('a/b', { baseUrl: BASE, fetch }), { status: 'not_found' });
  assert.equal(calls.length, before);
});

test('resumo envia corpo vazio e valida o método declarado', async () => {
  const { fetch, calls } = fakeWorker(() =>
    Response.json({ summary: { text: 'Resumo sintético.', method: 'EXTRACT', createdAt: '2026-11-20T12:10:00.000Z' }, item: item() }),
  );
  const result = await summarizeNews('noticia-sintetica-1', { baseUrl: BASE, fetch });
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.method, 'EXTRACT');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.body, '{}');
  clearNewsCache();
  const wrong = fakeWorker(() =>
    Response.json({ summary: { text: 'x', method: 'HUMANO', createdAt: '2026-11-20T12:10:00.000Z' }, item: item() }),
  );
  assert.deepEqual(await summarizeNews('noticia-sintetica-1', { baseUrl: BASE, fetch: wrong.fetch }), { status: 'offline' });
});

test('as rotas locais de notícias exigem código de ação antes de tudo', async () => {
  for (const path of ['src/app/api/news/route.ts', 'src/app/api/news/[newsId]/route.ts', 'src/app/api/news/[newsId]/summary/route.ts']) {
    const source = await read(path);
    assert.match(source, /const denied = requireActionCode\(request\);\s*if \(denied\) return denied;/, path);
  }
});

test('as telas de notícias não importam nada financeiro nem enviam dados locais', async () => {
  for (const path of ['src/components/invest/news-page.tsx', 'src/components/invest/news-article.tsx', 'src/hooks/use-news.ts', 'src/server/cloud-news.ts']) {
    const source = await read(path);
    assert.doesNotMatch(source, /@\/server\/db|prisma|use-accounts|use-dashboard|use-transactions|profileId/i, path);
  }
});
