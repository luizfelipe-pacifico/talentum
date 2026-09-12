import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOfx, looksLikeOfx, OfxParseError } from '../src/server/import/ofx.ts';

/* Leitura de OFX. Todos os dados são sintéticos.

   A razão de existir deste parser está no ADR 0002: a biblioteca antes
   documentada falha justamente no primeiro caso testado aqui — OFX 1.x/SGML,
   com tags de folha sem fechamento, que é o que os bancos brasileiros exportam. */

/** OFX 1.x em SGML: tags de folha abertas, sem fechamento. */
const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>0001<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260601<DTEND>20260630
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260602120000[-3:BRT]<TRNAMT>-100.50<FITID>SYNTH-0001<MEMO>COMPRA SINTETICA A</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260615120000[-3:BRT]<TRNAMT>250.00<FITID>SYNTH-0002<MEMO>CREDITO SINTETICO B</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>149.50<DTASOF>20260630120000[-3:BRT]</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

/** OFX 2.x em XML: tudo fechado. */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="200"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL</CURDEF>
<BANKTRANLIST><DTSTART>20260601</DTSTART><DTEND>20260630</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260602</DTPOSTED><TRNAMT>-100.50</TRNAMT><FITID>SYNTH-0001</FITID><MEMO>COMPRA &amp; SERVICO</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('lê OFX 1.x em SGML, com tags de folha sem fechamento', () => {
  const statement = parseOfx(SGML);
  assert.equal(statement.entries.length, 2);
  assert.equal(statement.issues.length, 0);
  assert.equal(statement.entries[0].amountCents, -10050n);
  assert.equal(statement.entries[1].amountCents, 25000n);
  assert.equal(statement.entries[0].externalId, 'SYNTH-0001');
});

test('dinheiro vira BigInt em centavos, nunca ponto flutuante', () => {
  // O motivo do ADR 0002: `-100.50` como `number` é ponto flutuante, que
  // docs/DATA_MODEL.md proíbe em valor monetário.
  const statement = parseOfx(SGML);
  for (const entry of statement.entries) assert.equal(typeof entry.amountCents, 'bigint');
});

test('lê período, saldo e conta declarados pelo arquivo', () => {
  const statement = parseOfx(SGML);
  assert.equal(statement.periodStart.toISOString().slice(0, 10), '2026-06-01');
  assert.equal(statement.periodEnd.toISOString().slice(0, 10), '2026-06-30');
  assert.equal(statement.ledgerBalanceCents, 14950n);
  assert.equal(statement.currency, 'BRL');
  assert.equal(statement.accountId, '12345-6');
  assert.equal(statement.bankId, '0001');
});

test('lê OFX 2.x em XML e decodifica entidades', () => {
  const statement = parseOfx(XML);
  assert.equal(statement.entries.length, 1);
  assert.equal(statement.entries[0].description, 'COMPRA & SERVICO');
});

test('a hora do banco não muda o dia civil do lançamento', () => {
  const statement = parseOfx(SGML);
  assert.equal(statement.entries[0].occurredOn.getDate(), 2);
  assert.equal(statement.entries[0].occurredOn.getHours(), 0);
});

test('lançamento ilegível vira problema declarado, sem derrubar o arquivo', () => {
  const withBad = SGML.replace('<TRNAMT>250.00', '<TRNAMT>ilegivel');
  const statement = parseOfx(withBad);
  assert.equal(statement.entries.length, 1, 'o lançamento bom continua sendo importado');
  assert.equal(statement.issues.length, 1, 'o lançamento ruim é declarado, não omitido');
  assert.equal(statement.issues[0].code, 'AMOUNT_UNREADABLE');
});

test('reconhece OFX pelo conteúdo, não pela extensão', () => {
  assert.equal(looksLikeOfx(SGML), true);
  assert.equal(looksLikeOfx(XML), true);
  assert.equal(looksLikeOfx('Data;Valor\n04/09/2026;-1,00'), false);
});

test('recusa arquivo que não é OFX', () => {
  assert.throws(() => parseOfx('Data;Valor'), OfxParseError);
  assert.throws(() => parseOfx('<OFX></OFX>'), (error) => error.code === 'NO_TRANSACTIONS');
});
