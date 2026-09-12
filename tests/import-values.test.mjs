import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmountCents,
  parseCivilDate,
  endOfCivilDay,
  ValueParseError,
} from '../src/server/import/values.ts';

/* Valores e datas do extrato. Todos os dados são sintéticos. */

const cents = (text, separator) => parseAmountCents(text, separator).cents;

test('lê o formato monetário brasileiro com moeda e sinal separados', () => {
  assert.equal(cents('- R$ 458,33'), -45833n);
  assert.equal(cents('+ R$ 1.586,46'), 158646n);
  assert.equal(cents('R$ 1.234,56'), 123456n);
  assert.equal(cents('1.234,56'), 123456n);
});

test('lê o formato anglófono sem confundir milhar com decimal', () => {
  assert.equal(cents('1,234.56'), 123456n);
  assert.equal(cents('-1234.56'), -123456n);
  assert.equal(cents('250.00', '.'), 25000n);
});

test('um separador isolado com três casas é milhar, não decimal', () => {
  // "1.234" é mil duzentos e trinta e quatro reais, não um real e vinte e três.
  assert.equal(cents('1.234'), 123400n);
  assert.equal(cents('1,5'), 150n);
  assert.equal(cents('1234'), 123400n);
});

test('três dígitos após um separador isolado são resolvidos como milhar', () => {
  // Caso genuinamente ambíguo: "1,005" tanto poderia ser mil e cinco reais
  // quanto um real e meio centavo. Extrato escreve dinheiro com duas casas, e
  // ler mil reais como um real é o erro caro — a regra resolve para milhar.
  assert.equal(cents('1,005'), 100500n);
  assert.equal(cents('1.005'), 100500n);
  // Com o separador declarado pelo mapeamento, não há ambiguidade a resolver.
  assert.equal(cents('1,005', ','), 101n);
});

test('reconhece as notações de sinal que os bancos usam', () => {
  assert.equal(cents('(1.234,56)'), -123456n, 'parênteses contábeis');
  assert.equal(cents('1.234,56-'), -123456n, 'sinal sufixado');
  assert.equal(cents('1.234,56D'), -123456n, 'marcador de débito');
  assert.equal(cents('1.234,56C'), 123456n, 'marcador de crédito');
});

test('arredonda a terceira casa meio para cima, sem truncar em silêncio', () => {
  // Quatro dígitos após o separador não são ambíguos: é decimal.
  assert.equal(cents('1,0050'), 101n);
  assert.equal(cents('1,0049'), 100n);
  assert.equal(cents('-1,0050'), -101n, 'o sinal é preservado no arredondamento');
  assert.equal(cents('0,125'), 13n, 'meio centavo sobe');
});

test('recusa valor que não é número em vez de devolver zero', () => {
  // Devolver 0n aqui gravaria um lançamento inventado no extrato da pessoa.
  for (const bad of ['', 'abc', 'R$', '--5', '1..2,3x']) {
    assert.throws(() => parseAmountCents(bad), ValueParseError, bad);
  }
});

test('lê os formatos de data que os bancos exportam', () => {
  const iso = (date) => date.toISOString().slice(0, 10);
  assert.equal(iso(parseCivilDate('04/09/2026')), '2026-09-04');
  assert.equal(iso(parseCivilDate('2026-09-04')), '2026-09-04');
  assert.equal(iso(parseCivilDate('04-09-2026')), '2026-09-04');
  assert.equal(iso(parseCivilDate('20260904')), '2026-09-04');
  assert.equal(iso(parseCivilDate('04/09/26')), '2026-09-04');
});

test('a data é civil local, não instante UTC', () => {
  // O painel agrega por dia civil local; guardar UTC moveria o lançamento da
  // noite do dia 31 para o mês seguinte.
  const date = parseCivilDate('31/01/2026');
  assert.equal(date.getDate(), 31);
  assert.equal(date.getMonth(), 0);
  assert.equal(date.getHours(), 0);
});

test('recusa data que não existe em vez de transbordar para o mês seguinte', () => {
  assert.throws(() => parseCivilDate('31/02/2026'), ValueParseError);
  assert.throws(() => parseCivilDate('00/09/2026'), ValueParseError);
  assert.throws(() => parseCivilDate('04/13/2026'), ValueParseError);
  assert.throws(() => parseCivilDate('04/09/1500'), ValueParseError);
  assert.throws(() => parseCivilDate('quarta-feira'), ValueParseError);
});

test('o fim do dia civil é o último milissegundo', () => {
  const end = endOfCivilDay(parseCivilDate('04/09/2026'));
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
  assert.equal(end.getMilliseconds(), 999);
});
