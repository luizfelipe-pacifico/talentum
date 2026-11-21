import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPdf, tableLines } from './helpers/synthetic-pdf.mjs';
import { extractPdfText, looksLikePdf } from '../src/server/import/pdf/extract.ts';
import { inspectPdfStatement } from '../src/server/import/pdf/inspect.ts';
import { PDF_LAYOUTS, selectLayout } from '../src/server/import/pdf/layouts.ts';
import { readAmount, readLeadingDate } from '../src/server/import/pdf/lines.ts';
import { inspectStatementFile } from '../src/server/import/inspect-file.ts';

/* Importação de PDF (Stage 7, ADR 0006). Todos os documentos são gerados pelo
   próprio teste; nenhum extrato real é usado. */

const CARD = buildPdf([
  [
    [40, 800, 'BANCO SINTETICO S.A.'],
    [40, 785, 'FATURA DO CARTAO FINAL 0000'],
    [40, 770, 'Fechamento: 03/01/2027'],
    [40, 755, 'Vencimento: 10/01/2027'],
    [40, 740, 'Total da fatura'],
    [400, 740, 'R$ 1.234,50'],
    ...tableLines([
      ['28/12', 'MERCADO SINTETICO', '200,00'],
      ['02/01', 'LIVRARIA FICTICIA', '1.050,00'],
      ['02/01', 'ESTORNO LIVRARIA', '-15,50'],
    ]),
  ],
]);

const BANK = buildPdf([
  [
    [40, 800, 'EXTRATO DE CONTA SINTETICO'],
    [40, 785, 'Periodo ate 30/09/2026'],
    ...tableLines([
      ['01/09/2026', 'SALDO ANTERIOR', '1.000,00'],
      ['02/09/2026', 'PIX RECEBIDO FICTICIO', '500,00', '1.500,00'],
      ['03/09/2026', 'CONTA DE LUZ SINTETICA', '-120,30', '1.379,70'],
      ['04/09/2026', 'SALDO DO DIA', '1.379,70'],
    ]),
  ],
]);

test('reconhece PDF pela assinatura, não pela extensão', () => {
  assert.equal(looksLikePdf(CARD), true);
  assert.equal(looksLikePdf(new TextEncoder().encode('Data;Valor\n01/01/2026;10,00')), false);
  // Lixo antes da assinatura é tolerado dentro do primeiro KB, como na especificação.
  const padded = new Uint8Array([...new TextEncoder().encode('lixo\n'), ...CARD]);
  assert.equal(looksLikePdf(padded), true);
});

test('fatura genérica: vencimento, total, compras e estorno com o sinal certo', async () => {
  const result = await inspectPdfStatement(CARD);
  assert.equal(result.format, 'pdf');
  assert.equal(result.pdf.parserId, 'fatura-cartao-generica');
  assert.equal(result.pdf.kind, 'card');
  assert.equal(result.pdf.declared.totalCents, 123450n);
  assert.equal(result.pdf.declared.dueDate.getDate(), 10);
  assert.equal(result.pdf.declared.closingDate.getMonth(), 0);

  const amounts = result.entries.map((entry) => entry.amountCents);
  // Compra é saída (negativa); estorno é crédito (positivo).
  assert.deepEqual(amounts, [-20000n, -105000n, 1550n]);

  // Lançamento de dezembro numa fatura que vence em janeiro é do ano anterior.
  assert.equal(result.entries[0].occurredOn.getFullYear(), 2026);
  assert.equal(result.entries[0].occurredOn.getMonth(), 11);
  assert.equal(result.entries[1].occurredOn.getFullYear(), 2027);

  // Cada lançamento aceito traz a confiança por campo para a prévia.
  for (const entry of result.entries) {
    const confidence = result.pdf.confidence[entry.lineNumber];
    assert.ok(confidence, 'confiança por lançamento');
    assert.ok(confidence.overall >= result.pdf.threshold);
    assert.equal(confidence.date, 0.8, 'data sem ano depende do vencimento');
  }
});

test('extrato genérico: saldo vira saldo de fechamento, nunca lançamento', async () => {
  const result = await inspectPdfStatement(BANK);
  assert.equal(result.pdf.parserId, 'extrato-tabular-generico');
  assert.deepEqual(
    result.entries.map((entry) => entry.amountCents),
    [50000n, -12030n],
  );
  assert.equal(result.entries[0].balanceAfterCents, 150000n);
  assert.equal(result.closingBalance.cents, 137970n);
  assert.equal(result.closingBalance.capturedAt.getDate(), 4);
  assert.equal(result.closingBalance.capturedAt.getHours(), 23);
  assert.ok(result.entries.every((entry) => !/SALDO/.test(entry.description)));
});

test('sem pista de sinal, a direção é incerta e a linha vira problema declarado', async () => {
  const pdf = buildPdf([
    tableLines([
      ['02/09/2026', 'MOVIMENTO SINTETICO A', '500,00'],
      ['03/09/2026', 'MOVIMENTO SINTETICO B', '120,30'],
    ]),
  ]);
  const result = await inspectPdfStatement(pdf);
  assert.equal(result.entries.length, 0, 'nada entra em silêncio');
  assert.equal(result.pdf.lowConfidenceCount, 2);
  const issues = result.issues.filter((issue) => issue.code === 'LOW_CONFIDENCE');
  assert.equal(issues.length, 2);
  assert.match(issues[0].message, /valor ou sinal/);
  assert.doesNotMatch(issues[0].message, /MOVIMENTO/, 'a mensagem não repete o conteúdo do documento');
});

test('linha com data e valor ilegível é declarada, não omitida', async () => {
  const pdf = buildPdf([
    tableLines([
      ['02/09/2026', 'PAGAMENTO SINTETICO', '-50,00'],
      // Milhares de dígitos: não é valor de extrato pessoal.
      ['03/09/2026', 'VALOR ABSURDO', `${'9'.repeat(400)},00`],
      ['04/09/2026', 'VALOR NAN', 'NaN'],
    ]),
  ]);
  const result = await inspectPdfStatement(pdf);
  assert.equal(result.entries.length, 1);
  assert.equal(result.issues.filter((issue) => issue.code === 'AMOUNT_UNREADABLE').length, 2);
});

test('PDF com JavaScript, ação automática e anexo: nada executa, só o texto é lido', async () => {
  let executed = false;
  globalThis.__talentumPdfProbe = () => {
    executed = true;
  };
  const pdf = buildPdf([tableLines([['02/09/2026', 'COMPRA SINTETICA', '-10,00']])], {
    catalogExtra:
      '/OpenAction << /S /JavaScript /JS (globalThis.__talentumPdfProbe\\(\\)) >> /Names << /EmbeddedFiles << /Names [] >> >> /AA << /WC << /S /Launch /F (calc.exe) >> >>',
  });
  const result = await inspectPdfStatement(pdf);
  assert.equal(executed, false);
  assert.equal(result.entries.length, 1);
  assert.ok(result.issues.some((issue) => issue.code === 'PDF_ACTIVE_CONTENT_IGNORED'));
  delete globalThis.__talentumPdfProbe;
});

test('PDF com mais páginas que o teto é recusado antes de ler qualquer uma', async () => {
  const pages = Array.from({ length: 41 }, () => [[40, 700, 'x']]);
  await assert.rejects(inspectPdfStatement(buildPdf(pages)), (error) => error.code === 'TOO_MANY_PAGES');
});

test('contagem de páginas falsificada não faz o leitor inventar páginas', async () => {
  const pdf = buildPdf([tableLines([['02/09/2026', 'COMPRA SINTETICA', '-10,00']])], { declaredPages: 5000 });
  const result = await extractPdfText(pdf).catch((error) => error);
  // Ou o documento é recusado, ou só a página real é lida: nunca 5000 páginas.
  if (result instanceof Error) assert.ok(['TOO_MANY_PAGES', 'UNSUPPORTED_FORMAT'].includes(result.code));
  else assert.ok(result.pageCount <= 40 && result.lines.length === 1);
});

test('tetos de páginas e de texto recusam o arquivo inteiro em vez de truncar', async () => {
  const twoPages = buildPdf([
    tableLines([['02/09/2026', 'COMPRA A', '-10,00']]),
    tableLines([['03/09/2026', 'COMPRA B', '-20,00']]),
  ]);
  await assert.rejects(extractPdfText(twoPages, { maxPages: 1 }), (error) => error.code === 'TOO_MANY_PAGES');
  await assert.rejects(extractPdfText(twoPages, { maxChars: 10 }), (error) => error.code === 'PDF_TOO_MUCH_TEXT');
});

test('teto de tempo interrompe a leitura', async () => {
  const many = buildPdf(Array.from({ length: 30 }, (_, page) => tableLines([[`0${(page % 9) + 1}/09/2026`, 'COMPRA', '-1,00']])));
  await assert.rejects(extractPdfText(many, { timeoutMs: 0 }), (error) => error.code === 'PDF_TIMEOUT');
});

test('PDF corrompido ou truncado é recusado com código estável', async () => {
  const truncated = CARD.slice(0, 200);
  await assert.rejects(inspectPdfStatement(truncated), (error) =>
    ['UNSUPPORTED_FORMAT', 'NO_ROWS'].includes(error.code),
  );
  const garbage = new TextEncoder().encode('%PDF-1.7\n\u0000\u0001 nada aqui');
  await assert.rejects(inspectPdfStatement(garbage), (error) => ['UNSUPPORTED_FORMAT', 'NO_ROWS'].includes(error.code));
});

test('PDF cifrado é recusado como protegido por senha', async () => {
  const pdf = buildPdf([tableLines([['02/09/2026', 'COMPRA', '-10,00']])]);
  const text = Buffer.from(pdf).toString('latin1');
  const fake = '0'.repeat(32);
  const encrypted = text.replace(
    /trailer\n<< /,
    `trailer\n<< /Encrypt << /Filter /Standard /V 1 /R 2 /O <${fake}> /U <${fake}> /P -4 >> /ID [<${fake}> <${fake}>] `,
  );
  await assert.rejects(inspectPdfStatement(new Uint8Array(Buffer.from(encrypted, 'latin1'))), (error) =>
    ['PDF_ENCRYPTED', 'UNSUPPORTED_FORMAT', 'NO_ROWS'].includes(error.code),
  );
});

test('a impressão digital vem do texto: metadados diferentes, mesmo extrato', async () => {
  const lines = [tableLines([['02/09/2026', 'COMPRA SINTETICA', '-10,00']])];
  const first = await inspectPdfStatement(buildPdf(lines));
  const second = await inspectPdfStatement(buildPdf(lines, { catalogExtra: '/Lang (pt-BR)' }));
  assert.equal(first.fingerprint, second.fingerprint);
});

test('o despacho por conteúdo mantém CSV no caminho de texto', async () => {
  const csv = new TextEncoder().encode('Data;Descricao;Valor\n02/09/2026;COMPRA;-10,00\n');
  const result = await inspectStatementFile(csv);
  assert.equal(result.format, 'csv');
  assert.equal(result.pdf, undefined);
  const pdf = await inspectStatementFile(CARD);
  assert.equal(pdf.format, 'pdf');
});

test('registro: o leitor genérico de extrato é sempre o último recurso', () => {
  assert.equal(PDF_LAYOUTS.at(-1).id, 'extrato-tabular-generico');
  const ids = PDF_LAYOUTS.map((layout) => layout.id);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  for (const layout of PDF_LAYOUTS) assert.ok(Number.isInteger(layout.version) && layout.version >= 1);
  const empty = { pageCount: 1, lines: [], charCount: 0, activeContent: false };
  assert.equal(selectLayout(empty).id, 'extrato-tabular-generico');
});

test('leitura de campos: datas e valores', () => {
  assert.equal(readLeadingDate('05/09/2026 X', null).confidence, 1);
  assert.equal(readLeadingDate('05/09 X', null).confidence, 0.4, 'sem referência, o ano é palpite');
  assert.equal(readLeadingDate('05 SET X', new Date(2026, 8, 30)).date.getMonth(), 8);
  assert.equal(readLeadingDate('31/02/2026 X', null), null);
  assert.equal(readAmount('1.234,56D').cents, -123456n);
  assert.equal(readAmount('(10,00)').cents, -1000n);
  assert.equal(readAmount('10,00').explicitSign, false);
});

test('a extração não busca nada fora dos bytes e não avalia código', async () => {
  const source = await readFile(new URL('../src/server/import/pdf/read-pdf.ts', import.meta.url), 'utf8');
  for (const option of [
    'isEvalSupported: false',
    'enableXfa: false',
    'disableFontFace: true',
    'useSystemFonts: false',
    'useWorkerFetch: false',
    'disableAutoFetch: true',
  ]) {
    assert.ok(source.includes(option), option);
  }
  assert.doesNotMatch(source, /standardFontDataUrl|cMapUrl|workerSrc|https?:\/\//);
  // A versão instalada do pdf.js não tem nenhum caminho com avaliação de código.
  for (const bundle of ['pdf.mjs', 'pdf.worker.mjs']) {
    const code = await readFile(new URL(`../node_modules/pdfjs-dist/legacy/build/${bundle}`, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /new Function\(|[^\w.]eval\(/, bundle);
  }
});
