import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveClosingBalance,
  fingerprintOf,
  inspectStatement,
  previewOf,
} from '../src/server/import/inspect.ts';
import { MAX_FILE_BYTES } from '../src/server/import/limits.ts';

/* Inspeção do extrato. Todos os dados são sintéticos. */

const encode = (text) => new TextEncoder().encode(text);

/** Extrato sintético do mais novo para o mais antigo, com saldo corrente. */
const DESCENDING = [
  'Data;Descricao;Identificador;Tipo;Valor;Saldo',
  '04/09/2026;COMPRA SINTETICA C;SYNTH-0003;DEBITO;- R$ 100,00;R$ 400,00',
  '03/09/2026;COMPRA SINTETICA B;SYNTH-0002;DEBITO;- R$ 50,00;R$ 500,00',
  '02/09/2026;CREDITO SINTETICO A;SYNTH-0001;CREDITO;+ R$ 550,00;R$ 550,00',
].join('\n');

test('inspeciona um CSV e devolve tudo o que a decisão exige', () => {
  const result = inspectStatement(encode(DESCENDING));
  assert.equal(result.format, 'csv');
  assert.equal(result.entries.length, 3);
  assert.equal(result.issues.length, 0);
  assert.equal(result.dialect.separator, ';');
  assert.equal(result.periodStart.getDate(), 2);
  assert.equal(result.periodEnd.getDate(), 4);
});

test('o saldo de fechamento é o posterior ao último lançamento', () => {
  // Em arquivo decrescente, o saldo de fechamento está na primeira linha.
  // Pegar sempre a última devolveria o saldo de abertura.
  const result = inspectStatement(encode(DESCENDING));
  assert.equal(result.closingBalance.cents, 40000n);
  assert.equal(result.closingBalance.capturedAt.getDate(), 4);
  assert.equal(result.closingBalance.capturedAt.getHours(), 23, 'ancorado no fim do dia civil');
});

test('o saldo de fechamento também é achado em arquivo crescente', () => {
  const ascending = [
    'Data;Descricao;Identificador;Tipo;Valor;Saldo',
    '02/09/2026;CREDITO SINTETICO A;SYNTH-0001;CREDITO;+ R$ 550,00;R$ 550,00',
    '03/09/2026;COMPRA SINTETICA B;SYNTH-0002;DEBITO;- R$ 50,00;R$ 500,00',
    '04/09/2026;COMPRA SINTETICA C;SYNTH-0003;DEBITO;- R$ 100,00;R$ 400,00',
  ].join('\n');
  assert.equal(inspectStatement(encode(ascending)).closingBalance.cents, 40000n);
});

test('deriveClosingBalance devolve nulo sem coluna de saldo', () => {
  const entries = [{ occurredOn: new Date(2026, 8, 4), amountCents: -1n, balanceAfterCents: null, lineNumber: 1 }];
  assert.equal(deriveClosingBalance(entries), null);
});

test('extrato de um único dia usa a cadeia de saldo para achar o fechamento', () => {
  // As datas não desempatam aqui: todos os lançamentos são do mesmo dia. Só a
  // coerência da cadeia revela qual linha traz o saldo final.
  const sameDay = [
    'Data;Descricao;Identificador;Tipo;Valor;Saldo',
    '04/09/2026;COMPRA SINTETICA C;SYNTH-0003;DEBITO;- R$ 100,00;R$ 400,00',
    '04/09/2026;COMPRA SINTETICA B;SYNTH-0002;DEBITO;- R$ 50,00;R$ 500,00',
    '04/09/2026;CREDITO SINTETICO A;SYNTH-0001;CREDITO;+ R$ 550,00;R$ 550,00',
  ].join('\n');
  assert.equal(inspectStatement(encode(sameDay)).closingBalance.cents, 40000n);

  // O mesmo arquivo na ordem inversa tem o mesmo saldo final.
  const ascending = [
    'Data;Descricao;Identificador;Tipo;Valor;Saldo',
    '04/09/2026;CREDITO SINTETICO A;SYNTH-0001;CREDITO;+ R$ 550,00;R$ 550,00',
    '04/09/2026;COMPRA SINTETICA B;SYNTH-0002;DEBITO;- R$ 50,00;R$ 500,00',
    '04/09/2026;COMPRA SINTETICA C;SYNTH-0003;DEBITO;- R$ 100,00;R$ 400,00',
  ].join('\n');
  assert.equal(inspectStatement(encode(ascending)).closingBalance.cents, 40000n);
});

test('sem conseguir determinar a ordem, nenhum saldo é derivado', () => {
  // Mesma data e cadeia de saldo incoerente: apresentar um saldo de abertura
  // como saldo atual é pior do que declarar saldo desconhecido.
  const ambiguous = [
    'Data;Descricao;Identificador;Tipo;Valor;Saldo',
    '04/09/2026;COMPRA SINTETICA X;SYNTH-0001;DEBITO;- R$ 10,00;R$ 900,00',
    '04/09/2026;COMPRA SINTETICA Y;SYNTH-0002;DEBITO;- R$ 20,00;R$ 700,00',
  ].join('\n');
  assert.equal(inspectStatement(encode(ambiguous)).closingBalance, null);
});

test('a impressão digital ignora quebra de linha, mas não o conteúdo', () => {
  // O mesmo extrato reexportado com CRLF continua sendo o mesmo extrato.
  assert.equal(fingerprintOf(DESCENDING), fingerprintOf(DESCENDING.replace(/\n/g, '\r\n')));
  assert.notEqual(fingerprintOf(DESCENDING), fingerprintOf(DESCENDING.replace('100,00', '101,00')));
});

test('conta identificadores repetidos dentro do próprio arquivo', () => {
  const repeated = DESCENDING.replace('SYNTH-0002', 'SYNTH-0003');
  assert.equal(inspectStatement(encode(repeated)).duplicateExternalIds, 1);
});

test('a prévia é amostra e não devolve o lote inteiro', () => {
  const rows = ['Data;Descricao;Tipo;Valor'];
  for (let index = 1; index <= 40; index += 1) {
    rows.push(`0${(index % 9) + 1}/09/2026;LANCAMENTO SINTETICO ${index};DEBITO;- R$ 1,00`);
  }
  const result = inspectStatement(encode(rows.join('\n')));
  assert.equal(result.entries.length, 40);
  assert.ok(previewOf(result).length <= 12, 'a prévia não pode despejar o arquivo inteiro');
});

test('valores só viram texto na renderização, nunca no contrato', () => {
  // docs/DASHBOARD.md, R-25: centavos inteiros até a borda de apresentação.
  const preview = previewOf(inspectStatement(encode(DESCENDING)));
  for (const row of preview) {
    assert.match(row.amountCents, /^-?\d+$/, 'a prévia devolveu texto formatado');
  }
});

test('recusa arquivo grande demais sem tentar lê-lo', () => {
  const oversized = new Uint8Array(MAX_FILE_BYTES + 1);
  assert.throws(() => inspectStatement(oversized), (error) => error.code === 'FILE_TOO_LARGE');
});

test('recusa arquivo vazio e arquivo binário', () => {
  assert.throws(() => inspectStatement(new Uint8Array(0)), (error) => error.code === 'EMPTY_FILE');
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01]);
  assert.throws(() => inspectStatement(zip), (error) =>
    error.code === 'BINARY_CONTENT' || error.code === 'UNREADABLE_ENCODING');
});

test('recusa quando não há coluna de data ou de valor', () => {
  const text = ['Descricao;Observacao', 'ALGO SINTETICO;OUTRA COISA'].join('\n');
  assert.throws(() => inspectStatement(encode(text)), (error) =>
    error.code === 'MAPPING_INCOMPLETE' || error.code === 'NO_USABLE_ROWS');
});

test('mapeamento confirmado pela pessoa vence a sugestão automática', () => {
  const result = inspectStatement(encode(DESCENDING), {
    mapping: { roles: ['date', 'description', 'ignore', 'direction', 'amount', 'ignore'] },
  });
  // A coluna de saldo foi marcada como ignorada: não há saldo de fechamento.
  assert.equal(result.closingBalance, null);
  assert.equal(result.entries.length, 3);
  assert.equal(result.entries[0].externalId, null);
});

test('conteúdo OFX é reconhecido mesmo com dialeto CSV informado', () => {
  const ofx = 'OFXHEADER:100\n\n<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260902<TRNAMT>-10.00<FITID>S1<MEMO>X</STMTTRN></BANKTRANLIST></OFX>';
  const result = inspectStatement(encode(ofx), { dialect: { separator: ';' } });
  assert.equal(result.format, 'ofx', 'o formato vem do conteúdo, não do que foi declarado');
});
