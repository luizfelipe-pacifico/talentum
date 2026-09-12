/* Conversão de valor monetário e de data do extrato.

   Módulo puro. Dinheiro vira `BigInt` em centavos e nunca passa por `Number`:
   `0.1 + 0.2` em ponto flutuante é exatamente o erro que `docs/DATA_MODEL.md`
   proíbe ao exigir centavos inteiros ou `Decimal`.

   Data vira data civil — meia-noite local — e não instante técnico. O painel
   agrega por dia civil local (`src/server/dashboard-metrics.ts`); guardar UTC
   aqui faria um lançamento da noite do dia 31 cair no mês seguinte. */

export type ParsedAmount = { cents: bigint };
export type DecimalSeparator = 'auto' | ',' | '.';

export type ValueParseErrorCode = 'AMOUNT_UNREADABLE' | 'DATE_UNREADABLE' | 'DATE_OUT_OF_RANGE';

export class ValueParseError extends Error {
  readonly code: ValueParseErrorCode;
  /** Texto original recusado. Fica no erro para diagnóstico, nunca em log. */
  readonly value: string;

  constructor(code: ValueParseErrorCode, value: string) {
    super(code);
    this.name = 'ValueParseError';
    this.code = code;
    this.value = value;
  }
}

/** Símbolos de moeda e separadores invisíveis que o banco insere no campo. */
const CURRENCY_NOISE = /(?:R\$|BRL|US\$|USD|EUR|€|\$| | |\s)/gi;

/**
 * Decide qual símbolo é o separador decimal.
 *
 * Com os dois presentes, o último é o decimal — vale para `1.234,56` e para
 * `1,234.56`.
 *
 * Com um só, a quantidade de dígitos à direita decide. Exatamente três é
 * ambíguo: `1,005` tanto poderia ser mil e cinco reais quanto um real e meio
 * centavo. A ambiguidade é resolvida como **agrupamento de milhar**, porque
 * extrato bancário escreve dinheiro com duas casas decimais — três dígitos
 * depois do separador são um grupo de milhar em praticamente todo arquivo real.
 * Ler `1,005` como `R$ 1,01` transformaria mil reais em um real.
 */
function detectDecimalSeparator(digits: string): ',' | '.' | null {
  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  if (lastComma === -1 && lastDot === -1) return null;
  if (lastComma !== -1 && lastDot !== -1) return lastComma > lastDot ? ',' : '.';

  const position = lastComma !== -1 ? lastComma : lastDot;
  const decimals = digits.length - position - 1;
  const head = digits.slice(0, position);

  // Um grupo de milhar nunca é precedido por um zero sozinho nem por mais de
  // três dígitos: `0,125` e `1234,567` só podem ser decimais, enquanto `1,005`
  // é mil e cinco.
  const headIsThousandGroup = /^\d{1,3}$/.test(head) && !/^0\d*$/.test(head);

  if (decimals === 3 && headIsThousandGroup) return null;
  return lastComma !== -1 ? ',' : '.';
}

/**
 * Converte o texto de um valor em centavos inteiros.
 *
 * Reconhece sinal por prefixo, por sufixo, por parênteses contábeis e pelos
 * marcadores `D`/`C` usados por alguns exportadores. Frações além de dois
 * dígitos são arredondadas meio para cima, nunca truncadas em silêncio.
 */
export function parseAmountCents(raw: string, decimalSeparator: DecimalSeparator = 'auto'): ParsedAmount {
  const original = raw ?? '';
  let text = original.replace(CURRENCY_NOISE, '');
  if (text.length === 0) throw new ValueParseError('AMOUNT_UNREADABLE', original);

  let negative = false;

  // Parênteses são a notação contábil de valor negativo.
  if (/^\((.*)\)$/.test(text)) {
    negative = true;
    text = text.replace(/^\((.*)\)$/, '$1');
  }

  // Marcador de débito/crédito colado no valor, como "1.234,56D".
  const marker = text.match(/^([+-]?[\d.,]+)\s*([DC])$/i);
  if (marker) {
    text = marker[1];
    if (marker[2].toUpperCase() === 'D') negative = true;
  }

  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1);
  }

  if (!/^[\d.,]+$/.test(text)) throw new ValueParseError('AMOUNT_UNREADABLE', original);

  const separator =
    decimalSeparator === 'auto' ? detectDecimalSeparator(text) : text.includes(decimalSeparator) ? decimalSeparator : null;

  let integerPart: string;
  let fractionPart: string;

  if (separator === null) {
    integerPart = text.replace(/[.,]/g, '');
    fractionPart = '';
  } else {
    const position = text.lastIndexOf(separator);
    integerPart = text.slice(0, position).replace(/[.,]/g, '');
    fractionPart = text.slice(position + 1).replace(/[.,]/g, '');
  }

  if (integerPart.length === 0) integerPart = '0';
  if (!/^\d+$/.test(integerPart) || (fractionPart.length > 0 && !/^\d+$/.test(fractionPart))) {
    throw new ValueParseError('AMOUNT_UNREADABLE', original);
  }

  const units = BigInt(integerPart);
  let cents = units * 100n;

  if (fractionPart.length > 0) {
    const twoDigits = fractionPart.slice(0, 2).padEnd(2, '0');
    cents += BigInt(twoDigits);
    // Arredondamento meio para cima declarado, nunca truncamento acidental.
    if (fractionPart.length > 2 && Number(fractionPart[2]) >= 5) cents += 1n;
  }

  return { cents: negative ? -cents : cents };
}

/** Janela civil aceita. Fora dela o valor quase certamente não é uma data. */
const MIN_YEAR = 1980;
const MAX_YEAR = 2200;

/**
 * Converte o texto de uma data em data civil local.
 *
 * Aceita os formatos que os bancos brasileiros exportam. Ano com dois dígitos é
 * resolvido na janela 2000–2099: extrato bancário não retroage ao século XX.
 */
export function parseCivilDate(raw: string): Date {
  const text = (raw ?? '').trim();
  if (text.length === 0) throw new ValueParseError('DATE_UNREADABLE', raw ?? '');

  let year: number;
  let month: number;
  let day: number;

  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  const ymd = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
    if (dmy[3].length === 2) year += 2000;
  } else if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  } else if (compact) {
    year = Number(compact[1]);
    month = Number(compact[2]);
    day = Number(compact[3]);
  } else {
    throw new ValueParseError('DATE_UNREADABLE', text);
  }

  if (year < MIN_YEAR || year > MAX_YEAR) throw new ValueParseError('DATE_OUT_OF_RANGE', text);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new ValueParseError('DATE_UNREADABLE', text);

  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  // Rejeita 31/02: o construtor transbordaria para março sem avisar.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new ValueParseError('DATE_UNREADABLE', text);
  }
  return date;
}

/** Último instante do dia civil local. Usado para ancorar o saldo do extrato. */
export function endOfCivilDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}
