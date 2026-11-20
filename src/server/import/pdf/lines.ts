/* Leitura de uma linha tabular de PDF: data no começo, valor no fim.

   Módulo puro, compartilhado pelos leitores de layout. Cada campo devolve a
   confiança da leitura, para que a prévia mostre o que foi lido com certeza e o
   que foi deduzido (ADR 0006). Os valores seguem o formato brasileiro
   (`1.234,56`); um layout com outro formato precisa de leitor próprio. */

import { MAX_DESCRIPTION_CHARS } from '../limits.ts';
import { collapseWhitespace } from '../text.ts';
import { parseAmountCents, parseCivilDate } from '../values.ts';
import type { PdfLine } from './extract.ts';
import type { FieldConfidence, PdfEntry, PdfStatementKind } from './types.ts';

const MONTHS: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

const FULL_DATE = /^(\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2}))(?=\s|$)/;
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(?=\s|$)/;
const SHORT_DATE = /^(\d{1,2})[/.](\d{1,2})(?=\s|$)/;
const NAMED_DATE = /^(\d{1,2})\s?(?:de\s)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?=\s|$)/i;

/** Valor monetário brasileiro, com sinal, parênteses ou marcador D/C opcionais. */
const AMOUNT = String.raw`\(?[+-]?\s?(?:R\$\s?)?[+-]?\d{1,3}(?:\.\d{3})*,\d{2}\)?(?:\s?[DC](?![A-Za-z])|-)?`;
const TRAILING_AMOUNT = new RegExp(`(?:^|\\s)(${AMOUNT})$`, 'i');

export type DateReading = { date: Date; confidence: number; length: number };

/**
 * Lê a data no começo do texto.
 *
 * Data completa vale confiança 1. Dia e mês sem ano dependem de uma referência
 * (vencimento ou período do documento): com ela, 0,8; sem ela, o ano é um
 * palpite e a confiança cai abaixo do mínimo.
 */
export function readLeadingDate(text: string, reference: Date | null): DateReading | null {
  const full = text.match(FULL_DATE) ?? text.match(ISO_DATE);
  if (full) {
    try {
      return { date: parseCivilDate(full[1]), confidence: 1, length: full[0].length };
    } catch {
      return null;
    }
  }

  let day: number;
  let month: number;
  let length: number;
  const short = text.match(SHORT_DATE);
  const named = text.match(NAMED_DATE);
  if (short) {
    day = Number(short[1]);
    month = Number(short[2]);
    length = short[0].length;
  } else if (named) {
    day = Number(named[1]);
    month = MONTHS[named[2].toLowerCase()];
    length = named[0].length;
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const anchor = reference ?? new Date();
  // Um lançamento de dezembro numa fatura que vence em janeiro é do ano anterior.
  const year = month > anchor.getMonth() + 2 ? anchor.getFullYear() - 1 : anchor.getFullYear();
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { date, confidence: reference ? 0.8 : 0.4, length };
}

export type AmountReading = { cents: bigint; explicitSign: boolean; raw: string };

/** Lê um valor monetário completo; `null` quando o texto não é um valor. */
export function readAmount(raw: string): AmountReading | null {
  const text = raw.trim();
  try {
    const { cents } = parseAmountCents(text, ',');
    const explicitSign = /^[(+-]|-$|[DC]$/i.test(text.replace(/R\$\s?/i, '').trim());
    return { cents, explicitSign, raw: text };
  } catch {
    return null;
  }
}

/** Separa até dois valores no fim do texto: o lançamento e, se houver, o saldo. */
export function peelTrailingAmounts(text: string): { rest: string; amounts: AmountReading[] } {
  const amounts: AmountReading[] = [];
  let rest = text;
  for (let index = 0; index < 2; index += 1) {
    const match = rest.match(TRAILING_AMOUNT);
    if (!match) break;
    const reading = readAmount(match[1]);
    if (!reading) break;
    amounts.unshift(reading);
    rest = rest.slice(0, rest.length - match[0].length).trimEnd();
  }
  return { rest, amounts };
}

/** Texto para comparação: sem acento, sem caixa, com espaços simples. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rótulos de linha que não são lançamento: saldos, totais e resumos. */
const SUMMARY_LINE =
  /^(saldo\b|saldo (anterior|do dia|final|inicial|em conta)|total\b|subtotal\b|pagamento minimo|limite\b|encargos\b|juros\b.*\bproxima fatura)/;

export function isSummaryLabel(description: string): boolean {
  return SUMMARY_LINE.test(normalizeText(description));
}

export type LineReading =
  | { kind: 'entry'; entry: PdfEntry }
  | { kind: 'balance'; occurredOn: Date; cents: bigint }
  | { kind: 'issue'; code: string }
  | { kind: 'skip' };

export type LineContext = {
  kind: PdfStatementKind;
  /** Data de referência para completar o ano de datas curtas. */
  reference: Date | null;
  /** O documento marca saídas com sinal; valor sem sinal é então entrada. */
  documentUsesSigns: boolean;
};

/**
 * Lê uma linha: data no começo, valor (e talvez saldo) no fim, descrição no meio.
 *
 * O sinal final segue a convenção do extrato (negativo é saída):
 *
 * - fatura de cartão: valor sem sinal é compra (saída); com `-`, `+`, `C` ou
 *   parênteses é crédito ou estorno;
 * - extrato de conta: valor com sinal ou `D`/`C` é lido como está; sem sinal,
 *   só é entrada quando o documento marca as saídas com sinal, e mesmo assim
 *   com confiança menor. Sem essa pista a direção é desconhecida.
 */
export function readLine(line: PdfLine, context: LineContext): LineReading {
  const dateReading = readLeadingDate(line.text, context.reference);
  if (!dateReading) return { kind: 'skip' };

  const afterDate = line.text.slice(dateReading.length).trim();
  const { rest, amounts } = peelTrailingAmounts(afterDate);
  if (amounts.length === 0) {
    // Uma linha que começa com data e tem texto, mas nenhum valor legível, é
    // declarada: pode ser um lançamento cujo valor o leitor não reconheceu.
    return afterDate.length > 0 ? { kind: 'issue', code: 'AMOUNT_UNREADABLE' } : { kind: 'skip' };
  }

  const description = collapseWhitespace(rest, MAX_DESCRIPTION_CHARS);

  // Duas colunas de valor: a segunda é o saldo corrente da linha.
  const amount = amounts.length === 2 ? amounts[0] : amounts[amounts.length - 1];
  const balance = amounts.length === 2 ? amounts[1] : null;

  if (isSummaryLabel(description)) {
    const value = balance ?? amount;
    return { kind: 'balance', occurredOn: dateReading.date, cents: value.cents };
  }

  let amountCents: bigint;
  let amountConfidence: number;
  if (context.kind === 'card') {
    const magnitude = amount.cents < 0n ? -amount.cents : amount.cents;
    if (amount.explicitSign) {
      // Na fatura, o valor marcado é crédito: estorno, pagamento ou ajuste.
      const isCredit = amount.cents < 0n || /\+|C$/i.test(amount.raw);
      amountCents = isCredit ? magnitude : -magnitude;
      amountConfidence = 1;
    } else {
      amountCents = -magnitude;
      amountConfidence = 0.9;
    }
  } else if (amount.explicitSign) {
    amountCents = amount.cents;
    amountConfidence = 1;
  } else {
    amountCents = amount.cents;
    amountConfidence = context.documentUsesSigns ? 0.75 : 0.5;
  }
  if (balance) amountConfidence = Math.min(amountConfidence, 0.95);
  if (amountCents === 0n) return { kind: 'issue', code: 'AMOUNT_ZERO' };

  const descriptionConfidence = /[a-zA-ZÀ-ÿ]{3,}/.test(description) ? 1 : 0.6;
  const confidence: FieldConfidence = {
    date: dateReading.confidence,
    amount: amountConfidence,
    description: descriptionConfidence,
    overall: Math.min(dateReading.confidence, amountConfidence, descriptionConfidence),
  };

  return {
    kind: 'entry',
    entry: {
      lineNumber: line.lineNumber,
      page: line.page,
      occurredOn: dateReading.date,
      description: description.length > 0 ? description : 'Lançamento sem descrição',
      amountCents,
      externalId: null,
      balanceAfterCents: balance ? balance.cents : null,
      confidence,
    },
  };
}

/** O documento usa sinal explícito em alguma linha que começa com data? */
export function documentUsesSigns(lines: PdfLine[]): boolean {
  for (const line of lines) {
    if (!readLeadingDate(line.text, new Date())) continue;
    const { amounts } = peelTrailingAmounts(line.text);
    if (amounts.some((amount) => amount.explicitSign)) return true;
  }
  return false;
}

/** Primeira data completa numa linha cujo rótulo casa com o padrão. */
export function findLabeledDate(lines: PdfLine[], label: RegExp): Date | null {
  for (const line of lines) {
    if (!label.test(normalizeText(line.text))) continue;
    const match = line.text.match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/);
    if (!match) continue;
    try {
      return parseCivilDate(match[1]);
    } catch {}
  }
  return null;
}

/** Primeiro valor monetário numa linha cujo rótulo casa com o padrão. */
export function findLabeledAmount(lines: PdfLine[], label: RegExp): bigint | null {
  for (const line of lines) {
    if (!label.test(normalizeText(line.text))) continue;
    const { amounts } = peelTrailingAmounts(line.text);
    const last = amounts[amounts.length - 1];
    if (last) return last.cents < 0n ? -last.cents : last.cents;
  }
  return null;
}
