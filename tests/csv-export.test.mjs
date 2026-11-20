import test from 'node:test';
import assert from 'node:assert/strict';

/* Exportação de lançamentos em CSV (Stage 19; docs/SECURITY.md, item 22).
   Descrições sintéticas montadas para virar fórmula numa planilha. */

const csv = await import('../src/server/export/csv.ts');

test('neutraliza texto que uma planilha leria como fórmula', () => {
  for (const hostile of ['=HIPERLINK("http://exemplo.invalid")', '+1+1', '-2+3', '@SOMA(A1)', '\tTAB', '\rCR', '  =1+1', '＝1+1'])
    assert.equal(csv.neutralizeCsvText(hostile), `'${hostile}`, JSON.stringify(hostile));
  for (const safe of ['Padaria sintética', 'PIX recebido', '', '1+1='])
    assert.equal(csv.neutralizeCsvText(safe), safe);
});

test('aspas internas são duplicadas e toda célula vai entre aspas', () => {
  assert.equal(csv.csvCell('a"b;c'), '"a""b;c"');
});

test('valor em centavos vira decimal com vírgula e mantém o sinal', () => {
  assert.equal(csv.formatCentsForCsv(-123456n), '-1234,56');
  assert.equal(csv.formatCentsForCsv(5n), '0,05');
  assert.equal(csv.formatCentsForCsv(0n), '0,00');
});

test('o arquivo tem BOM, cabeçalho e linhas neutralizadas, com valor negativo intacto', () => {
  const output = csv.transactionsCsv([
    {
      id: '00000000-0000-4000-8000-000000000001',
      occurredOn: new Date('2026-11-05T12:00:00Z'),
      description: '=CMD|" /C calc"!A0',
      amountCents: -4590n,
      currency: 'BRL',
      accountName: '@Conta sintética',
      categoryName: null,
      status: 'posted',
      importBatchId: null,
    },
  ]);
  assert.ok(output.startsWith('﻿"id";"data";"descricao";"valor"'));
  const line = output.split('\r\n')[1];
  assert.match(line, /"'=CMD\|"" \/C calc""!A0"/);
  assert.match(line, /"-45,90"/);
  assert.match(line, /"'@Conta sintética"/);
  assert.match(line, /"confirmado"/);
  assert.ok(output.endsWith('\r\n'));
});
