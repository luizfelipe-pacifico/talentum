import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertRow,
  detectSeparator,
  readCsvTable,
  splitCsvLine,
  suggestMapping,
} from '../src/server/import/csv.ts';
import { decodeStatement, repairMojibake } from '../src/server/import/text.ts';

/* Leitura de CSV de extrato. Todos os dados são sintéticos: nomes, valores e
   identificadores foram inventados para o teste (docs/DEVELOPMENT.md). */

const encode = (text) => new TextEncoder().encode(text);

/** Layout com sinal na coluna de valor e coluna de tipo, como o de vários bancos. */
const SAMPLE = [
  'Data;Descricao;CodTransacao;Identificador;Tipo;Valor;Saldo',
  '04/09/2026;COMPRA SINTETICA A;664;SYNTH-0001;DEBITO;- R$ 100,00;R$ 400,00',
  '03/09/2026;CREDITO SINTETICO B;493;SYNTH-0002;CREDITO;+ R$ 500,00;R$ 500,00',
].join('\n');

test('separa campos respeitando aspas', () => {
  assert.deepEqual(splitCsvLine('a;b;c', ';'), ['a', 'b', 'c']);
  // Sem o tratamento de aspas o separador interno partiria o campo e deslocaria
  // todas as colunas seguintes.
  assert.deepEqual(splitCsvLine('"COMPRA, PARCELA 1";10,00', ';'), ['COMPRA, PARCELA 1', '10,00']);
  assert.deepEqual(splitCsvLine('"aspas ""internas""";x', ';'), ['aspas "internas"', 'x']);
});

test('escolhe o separador por consistência, não por frequência', () => {
  // A vírgula aparece dentro de todo valor brasileiro e venceria por contagem.
  const lines = SAMPLE.split('\n');
  assert.equal(detectSeparator(lines), ';');
});

test('reconhece o cabeçalho e propõe o papel de cada coluna', () => {
  const table = readCsvTable(SAMPLE);
  assert.equal(table.dialect.hasHeader, true);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(suggestMapping(table).roles, [
    'date',
    'description',
    'document',
    'externalId',
    'direction',
    'amount',
    'balance',
  ]);
});

test('converte a linha em lançamento com centavos inteiros', () => {
  const table = readCsvTable(SAMPLE);
  const mapping = suggestMapping(table);
  const outcome = convertRow(table.rows[0], mapping, table.dialect);

  assert.equal(outcome.ok, true);
  assert.equal(outcome.entry.amountCents, -10000n);
  assert.equal(typeof outcome.entry.amountCents, 'bigint');
  assert.equal(outcome.entry.externalId, 'SYNTH-0001');
  assert.equal(outcome.entry.balanceAfterCents, 40000n);
  assert.equal(outcome.entry.occurredOn.getDate(), 4);
});

test('a coluna de tipo decide o sinal quando discorda do valor', () => {
  // O banco afirma a direção do dinheiro na coluna de tipo; um valor sem sinal
  // ou com sinal invertido não pode transformar débito em crédito.
  const text = ['Data;Descricao;Tipo;Valor', '04/09/2026;SAIDA SINTETICA;DEBITO;100,00'].join('\n');
  const table = readCsvTable(text);
  const outcome = convertRow(table.rows[0], suggestMapping(table), table.dialect);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.entry.amountCents, -10000n);
});

test('colunas separadas de débito e crédito viram um valor com sinal', () => {
  const text = [
    'Data;Historico;Debito;Credito',
    '04/09/2026;SAIDA SINTETICA;100,00;',
    '05/09/2026;ENTRADA SINTETICA;;250,00',
  ].join('\n');
  const table = readCsvTable(text);
  const mapping = suggestMapping(table);
  assert.equal(convertRow(table.rows[0], mapping, table.dialect).entry.amountCents, -10000n);
  assert.equal(convertRow(table.rows[1], mapping, table.dialect).entry.amountCents, 25000n);
});

test('recusa a linha quando não dá para saber se é entrada ou saída', () => {
  // Um débito importado como crédito corrompe o saldo inteiro; na dúvida, a
  // linha vira problema declarado em vez de palpite.
  const text = ['Data;Descricao;Valor', '04/09/2026;INDEFINIDO SINTETICO;100,00'].join('\n');
  const table = readCsvTable(text);
  const outcome = convertRow(table.rows[0], suggestMapping(table), table.dialect);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.code, 'DIRECTION_UNKNOWN');
});

test('linha sem data ou com valor zero não vira lançamento', () => {
  const text = [
    'Data;Descricao;Tipo;Valor',
    ';SEM DATA;DEBITO;10,00',
    '04/09/2026;VALOR ZERO;DEBITO;0,00',
  ].join('\n');
  const table = readCsvTable(text);
  const mapping = suggestMapping(table);
  assert.equal(convertRow(table.rows[0], mapping, table.dialect).code, 'DATE_MISSING');
  assert.equal(convertRow(table.rows[1], mapping, table.dialect).code, 'AMOUNT_ZERO');
});

test('infere as colunas por conteúdo quando não há cabeçalho', () => {
  const text = ['04/09/2026;COMPRA SINTETICA LONGA;-100,00', '03/09/2026;OUTRA COMPRA SINTETICA;-50,00'].join('\n');
  const table = readCsvTable(text);
  assert.equal(table.dialect.hasHeader, false);
  const roles = suggestMapping(table).roles;
  assert.equal(roles[0], 'date');
  assert.equal(roles[1], 'description');
  assert.equal(roles[2], 'amount');
});

test('remove o BOM para que ele não grude no primeiro nome de coluna', () => {
  const decoded = decodeStatement(encode('﻿Data;Valor\n04/09/2026;-1,00'));
  assert.ok(decoded.text.startsWith('Data;'), 'o BOM continuava colado ao cabeçalho');
});

test('conserta mojibake campo a campo, sem estragar o campo correto', () => {
  // Extrato real chega com corrupção parcial: reconverter o arquivo inteiro
  // quebraria o campo que já estava certo.
  const misto = 'TRANSFERÊNCIA e RegiÃ£o';
  assert.equal(repairMojibake(misto), 'TRANSFERÊNCIA e Região');
  assert.equal(repairMojibake('nada a consertar'), 'nada a consertar');
});

test('recusa conteúdo binário disfarçado de extrato', () => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02]);
  assert.throws(() => decodeStatement(bytes), (error) =>
    error.code === 'BINARY_CONTENT' || error.code === 'UNREADABLE_ENCODING');
});

test('lê arquivo gravado em Windows-1252', () => {
  // Exportadores legados dos bancos ainda usam essa tabela.
  const latin1 = new Uint8Array([...'Data;Descricao\n04/09/2026;CONCEI'].map((c) => c.charCodeAt(0)).concat([0xc7, 0xc3, 0x4f]));
  const decoded = decodeStatement(latin1);
  assert.equal(decoded.encoding, 'windows-1252');
  assert.ok(decoded.text.includes('CONCEIÇÃO'));
});
