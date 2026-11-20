import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inspectStatement } from '../../src/server/import/inspect.ts';
import { MAX_FILE_BYTES, PARSE_TIMEOUT_MS } from '../../src/server/import/limits.ts';
import { readStatementUpload } from '../../src/server/import/request.ts';

/* Limites do importador declarados e não aplicados (docs/SECURITY.md, itens
   abertos 16 e 23).

   1. `PARSE_TIMEOUT_MS` existia em limits.ts, mas nenhum código o consultava:
      um arquivo construído para ser lento prendia a requisição sem limite.
   2. O teto de tamanho era conferido depois de `request.formData()`, que já
      tinha lido o corpo inteiro para a memória. Um upload de vários gigabytes
      era bufferizado antes da recusa. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const csv = new TextEncoder().encode('Data;Descrição;Valor\n01/09/2026;Mercado sintético;-10,00\n02/09/2026;Farmácia sintética;-25,50\n');

test('a leitura do extrato para quando o prazo de parsing acaba', () => {
  let clock = 0;
  const now = () => (clock += 1_000);
  assert.throws(() => inspectStatement(csv, { deadline: 1_500, now }), (error) => error.code === 'PARSE_TIMEOUT');
  // Com prazo folgado, o mesmo arquivo continua sendo lido.
  assert.equal(inspectStatement(csv, { deadline: Number.MAX_SAFE_INTEGER }).entries.length, 2);
});

test('as rotas de inspeção e de gravação passam o prazo de parsing', async () => {
  for (const path of ['src/app/api/imports/route.ts', 'src/app/api/imports/inspect/route.ts']) {
    const source = await read(path);
    assert.match(source, /deadline/, path);
    assert.match(source, /PARSE_TIMEOUT_MS/, path);
  }
  assert.ok(PARSE_TIMEOUT_MS > 0);
});

test('o upload é recusado pelo Content-Length antes de ler o corpo', async () => {
  let consumed = false;
  // highWaterMark 0: o stream só é puxado quando alguém lê o corpo.
  const body = new ReadableStream({ pull() { consumed = true; throw new Error('o corpo não podia ser lido'); } }, { highWaterMark: 0 });
  const request = new Request('http://127.0.0.1/api/imports', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(MAX_FILE_BYTES * 4) },
    body,
    duplex: 'half',
  });
  await assert.rejects(readStatementUpload(request), (error) => error.code === 'FILE_TOO_LARGE');
  assert.equal(consumed, false, 'o corpo não pode ter sido lido');
});

test('upload sem Content-Length é recusado em vez de lido sem limite', async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('--x--')); controller.close(); } });
  const request = new Request('http://127.0.0.1/api/imports', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=x' },
    body,
    duplex: 'half',
  });
  await assert.rejects(readStatementUpload(request), (error) => error.code === 'LENGTH_REQUIRED');
});

test('o middleware recusa pelo tamanho declarado antes de o Next receber o corpo inteiro', async () => {
  // Com middleware em /api, o Next copia o corpo para o middleware e só chama a
  // rota depois de recebê-lo inteiro: a checagem dentro da rota chegava tarde.
  const { bodyVerdict, MAX_JSON_BODY_BYTES } = await import(new URL('src/server/body-limits.ts', root).href);
  const { MAX_UPLOAD_BYTES } = await import(new URL('src/server/import/limits.ts', root).href);
  assert.deepEqual(bodyVerdict('POST', '/api/imports', String(MAX_UPLOAD_BYTES + 1)), { ok: false, status: 413, code: 'BODY_TOO_LARGE' });
  assert.deepEqual(bodyVerdict('POST', '/api/imports/inspect', null), { ok: false, status: 411, code: 'LENGTH_REQUIRED' });
  assert.deepEqual(bodyVerdict('POST', '/api/imports', String(MAX_UPLOAD_BYTES)), { ok: true });
  assert.deepEqual(bodyVerdict('POST', '/api/categories', String(MAX_JSON_BODY_BYTES + 1)), { ok: false, status: 413, code: 'BODY_TOO_LARGE' });
  assert.deepEqual(bodyVerdict('POST', '/api/categories', null), { ok: true });
  assert.deepEqual(bodyVerdict('PATCH', '/api/categories/x', '-1'), { ok: false, status: 411, code: 'LENGTH_REQUIRED' });
  assert.deepEqual(bodyVerdict('GET', '/api/imports', null), { ok: true });
  const middleware = await read('src/middleware.ts');
  const api = middleware.slice(middleware.indexOf("startsWith('/api/')"), middleware.indexOf('return NextResponse.next();'));
  assert.match(api, /bodyVerdict\(request\.method, request\.nextUrl\.pathname, request\.headers\.get\('content-length'\)\)/);
});
