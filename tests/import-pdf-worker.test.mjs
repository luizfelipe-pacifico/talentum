import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { buildPdf, tableLines } from './helpers/synthetic-pdf.mjs';
import { extractPdfText, parsePdfWorkerReply, pdfWorkerOptions, runPdfWorker } from '../src/server/import/pdf/extract.ts';
import { IMPORT_ERROR_MESSAGES, CLIENT_ERROR_STATUS } from '../src/server/import/request.ts';
import { PDF_WORKER_MAX_OLD_GENERATION_MB } from '../src/server/import/limits.ts';

/* Isolamento da leitura de PDF (ADR 0006, docs/SECURITY.md "Statement import").
   O pdf.js roda numa thread com teto de memória e prazo duro, sem ambiente nem
   segredos do servidor, e a resposta dela é validada como entrada hostil. As
   threads em tests/helpers/pdf-workers simulam um parser que trava, estoura a
   memória, quebra ou responde fora do formato. Todo PDF é sintético. */

const fixture = (name) => new URL(`./helpers/pdf-workers/${name}.mjs`, import.meta.url);
const PDF = buildPdf([tableLines([['02/09/2026', 'COMPRA SINTETICA', '-10,00']])]);
const factoryFor = (name, extra = {}) => (options) => new Worker(fixture(name), { ...options, ...extra });
const VALID = {
  ok: true,
  text: {
    pageCount: 1,
    lines: [{ lineNumber: 1, page: 1, cells: [{ x: 40, text: 'A' }], text: 'A' }],
    charCount: 1,
    activeContent: false,
  },
};

test('a leitura real passa pela thread isolada e devolve as linhas', async () => {
  const text = await extractPdfText(PDF);
  assert.equal(text.pageCount, 1);
  assert.equal(text.lines.length, 1);
  assert.match(text.lines[0].text, /COMPRA SINTETICA/);
});

test('quem chamou continua com os próprios bytes: só uma cópia é transferida', async () => {
  const bytes = PDF.slice();
  await extractPdfText(bytes);
  assert.equal(bytes.byteLength, PDF.byteLength);
  assert.deepEqual(bytes, PDF);
});

test('thread que trava é encerrada no prazo duro, com PDF_TIMEOUT, e o servidor segue respondendo', async () => {
  let ticks = 0;
  const heartbeat = setInterval(() => {
    ticks += 1;
  }, 20);
  const started = Date.now();
  try {
    await assert.rejects(runPdfWorker(factoryFor('hang'), PDF, {}, 300), (error) => error.code === 'PDF_TIMEOUT');
  } finally {
    clearInterval(heartbeat);
  }
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3_000, `encerrada em ${elapsed} ms`);
  // O laço de eventos do servidor nunca parou enquanto a thread girava.
  assert.ok(ticks >= 5, `laço de eventos ativo (${ticks} batidas)`);
  // A vaga da thread encerrada foi devolvida: a próxima leitura roda.
  const text = await extractPdfText(PDF);
  assert.equal(text.lines.length, 1);
});

test('thread que estoura o teto de memória vira PDF_TOO_COMPLEX, sem derrubar o servidor', async () => {
  await assert.rejects(runPdfWorker(factoryFor('oom'), PDF, {}, 20_000), (error) => error.code === 'PDF_TOO_COMPLEX');
  assert.equal((await extractPdfText(PDF)).lines.length, 1);
});

test('thread que quebra antes de responder vira PDF_READER_FAILED', async () => {
  await assert.rejects(runPdfWorker(factoryFor('crash'), PDF), (error) => error.code === 'PDF_READER_FAILED');
});

test('resposta fora do formato que chega pela thread é recusada', async () => {
  const bad = { ok: true, text: { ...VALID.text, charCount: 999 } };
  await assert.rejects(runPdfWorker(factoryFor('reply', { argv: [JSON.stringify(bad)] }), PDF), (error) => error.code === 'PDF_READER_FAILED');
  const good = await runPdfWorker(factoryFor('reply', { argv: [JSON.stringify(VALID)] }), PDF);
  assert.deepEqual(good, VALID.text);
});

test('a validação recusa toda resposta malformada e aceita só códigos de erro conhecidos', () => {
  assert.deepEqual(parsePdfWorkerReply(VALID), VALID.text);
  const line = VALID.text.lines[0];
  const malformed = [
    null,
    'texto',
    42,
    {},
    { ok: 'true', text: VALID.text },
    { ok: true },
    { ok: true, text: { ...VALID.text, extra: 'campo a mais' } },
    { ok: true, text: { ...VALID.text, pageCount: 0 } },
    { ok: true, text: { ...VALID.text, pageCount: 41 } },
    { ok: true, text: { ...VALID.text, pageCount: 1.5 } },
    { ok: true, text: { ...VALID.text, lines: [] } },
    { ok: true, text: { ...VALID.text, activeContent: 'no' } },
    { ok: true, text: { ...VALID.text, lines: [{ ...line, lineNumber: 2 }] } },
    { ok: true, text: { ...VALID.text, lines: [{ ...line, page: 2 }] } },
    { ok: true, text: { ...VALID.text, lines: [{ ...line, text: 42 }] } },
    { ok: true, text: { ...VALID.text, lines: [{ ...line, cells: [{ x: Number.NaN, text: 'A' }] }] } },
    { ok: true, text: { ...VALID.text, lines: [{ ...line, cells: [{ x: Number.POSITIVE_INFINITY, text: 'A' }] }] } },
    { ok: true, text: { ...VALID.text, lines: [{ ...line, cells: [{ x: 1, text: 'A', html: '<b>' }] }] } },
    { ...VALID, extra: 1 },
    { ok: false, code: 'UNKNOWN_CODE' },
    { ok: false, code: 'PDF_TIMEOUT', message: '/caminho/local' },
  ];
  for (const message of malformed) {
    assert.throws(() => parsePdfWorkerReply(message), (error) => error.code === 'PDF_READER_FAILED', JSON.stringify(message));
  }
  // Texto acima do teto pedido também é recusado na volta, não só na ida.
  assert.throws(() => parsePdfWorkerReply(VALID, { maxChars: 0 }), (error) => error.code === 'PDF_READER_FAILED');
  // Um erro conhecido atravessa com o próprio código.
  assert.throws(() => parsePdfWorkerReply({ ok: false, code: 'PDF_ENCRYPTED' }), (error) => error.code === 'PDF_ENCRYPTED');
});

test('a thread não recebe ambiente, argumentos nem nada além dos bytes e dos tetos', async () => {
  process.env.TALENTUM_SYNTHETIC_SECRET = 'valor-sintetico-de-teste';
  try {
    const buffer = PDF.slice().buffer;
    const options = pdfWorkerOptions(buffer, {});
    assert.equal(options.resourceLimits.maxOldGenerationSizeMb, PDF_WORKER_MAX_OLD_GENERATION_MB);
    assert.deepEqual(options.env, {});
    assert.ok(options.execArgv.every((flag) => !flag.startsWith('--inspect')));
    const report = await new Promise((resolve, reject) => {
      const worker = new Worker(fixture('probe'), options);
      worker.once('message', resolve);
      worker.once('error', reject);
    });
    assert.deepEqual(report.envKeys, [], 'process.env vazio na thread');
    assert.deepEqual(report.argv, []);
    assert.deepEqual(report.workerDataKeys.sort(), ['bytes', 'limits']);
    assert.equal(report.bytesIsArrayBuffer, true);
    assert.equal(report.byteLength, PDF.byteLength);
    assert.deepEqual(Object.keys(report.limits).sort(), ['maxChars', 'maxPages', 'timeoutMs']);
    // O buffer foi transferido, não copiado: deste lado ele ficou vazio.
    assert.equal(buffer.byteLength, 0);
  } finally {
    delete process.env.TALENTUM_SYNTHETIC_SECRET;
  }
});

test('o servidor cria a thread real com as opções supervisionadas, e só o worker importa o pdf.js', async () => {
  const supervisor = await readFile(new URL('../src/server/import/pdf/extract.ts', import.meta.url), 'utf8');
  assert.match(supervisor, /\(options\) => new Worker\(new URL\('\.\/extract-worker\.ts', import\.meta\.url\), options\)/);
  assert.doesNotMatch(supervisor, /SHARE_ENV/);
  assert.doesNotMatch(supervisor, /(?:from|import\()\s*'[^']*(?:pdfjs-dist|read-pdf)/);
  const entry = await readFile(new URL('../src/server/import/pdf/extract-worker.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(entry, /vault|prisma|process\.env|cookie/i);
  /* Sem `workerPublicPath`, o webpack monta o endereço do chunk com o publicPath
     do servidor (`/_next/`) e, no build, toda leitura de PDF falha com
     PDF_READER_FAILED. `next dev` e o servidor standalone dependem desta linha. */
  const config = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');
  assert.match(config, /isServer && nextRuntime === 'nodejs'\) config\.output = \{ \.\.\.config\.output, workerPublicPath: '\.\/' \}/);
});

test('cada falha da thread tem mensagem em português e status de erro da pessoa', () => {
  for (const code of ['PDF_TIMEOUT', 'PDF_TOO_COMPLEX', 'PDF_READER_FAILED']) {
    assert.match(IMPORT_ERROR_MESSAGES[code], /Nada foi importado\./, code);
    assert.doesNotMatch(IMPORT_ERROR_MESSAGES[code], /worker|thread|heap|memória do servidor|PDF_/i, code);
    assert.ok(CLIENT_ERROR_STATUS[code] >= 400 && CLIENT_ERROR_STATUS[code] < 500, code);
  }
});
