/* Leitura de OFX de extrato bancário.

   Módulo puro e deliberadamente pequeno. Lê apenas o subconjunto necessário do
   Open Financial Exchange: a lista de lançamentos, o período declarado, o saldo
   final e a identificação da conta. Tudo o mais é ignorado.

   Por que um leitor próprio, e não `ofx-data-extractor` (ver ADR 0002):

   1. a biblioteca falha em OFX 1.x/SGML, que é o formato que os bancos
      brasileiros exportam — tags de folha sem fechamento a fazem montar um JSON
      inválido e lançar durante a análise;
   2. ela normaliza dinheiro para `number`, e ponto flutuante em valor monetário
      é exatamente o que `docs/DATA_MODEL.md` proíbe.

   Aqui o valor permanece texto até `parseAmountCents`, que devolve `BigInt`. */

import { MAX_DESCRIPTION_CHARS, MAX_ROWS } from './limits.ts';
import { collapseWhitespace } from './text.ts';
import type { RawEntry } from './csv.ts';
import { parseAmountCents, parseCivilDate } from './values.ts';

export type OfxParseErrorCode = 'NOT_OFX' | 'NO_TRANSACTIONS' | 'TOO_MANY_ROWS';

export class OfxParseError extends Error {
  readonly code: OfxParseErrorCode;

  constructor(code: OfxParseErrorCode) {
    super(code);
    this.name = 'OfxParseError';
    this.code = code;
  }
}

/** Entidades XML que aparecem em descrição de lançamento. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, (match) => ENTITIES[match] ?? match)
    .replace(/&#(\d{1,6});/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

/**
 * Lê o valor de uma tag de folha.
 *
 * O mesmo padrão serve para SGML e XML: em SGML o valor termina no próximo
 * `<`, e em XML termina na tag de fechamento, que também começa com `<`.
 */
function leaf(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([^<]*)`, 'i'));
  if (!match) return null;
  const value = decodeEntities(match[1]).trim();
  return value.length > 0 ? value : null;
}

/**
 * Converte `DTPOSTED` em data civil.
 *
 * O campo vem como `AAAAMMDD`, opcionalmente com hora e fuso entre colchetes.
 * Só os oito primeiros dígitos importam: o domínio trabalha com data civil, e a
 * hora do banco não muda o dia a que o lançamento pertence.
 */
function parseOfxDate(value: string): Date {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 8) throw new OfxParseError('NOT_OFX');
  return parseCivilDate(digits.slice(0, 8));
}

export type OfxStatement = {
  entries: RawEntry[];
  issues: { lineNumber: number; code: string; message: string }[];
  currency: string | null;
  accountId: string | null;
  bankId: string | null;
  accountType: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  ledgerBalanceCents: bigint | null;
  ledgerBalanceAt: Date | null;
};

/** Reconhece o arquivo como OFX sem confiar em extensão ou tipo declarado. */
export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 4096).toUpperCase();
  return head.includes('<OFX>') || head.includes('OFXHEADER');
}

/**
 * Lê o extrato OFX.
 *
 * Cada `STMTTRN` que não puder ser convertido vira um problema declarado e a
 * leitura continua: um lançamento ilegível não pode descartar o arquivo
 * inteiro, mas também não pode ser silenciosamente omitido do lote.
 */
export function parseOfx(text: string): OfxStatement {
  if (!looksLikeOfx(text)) throw new OfxParseError('NOT_OFX');

  const body = text.slice(text.search(/<OFX>/i));
  const blocks = body.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) throw new OfxParseError('NO_TRANSACTIONS');
  if (blocks.length > MAX_ROWS) throw new OfxParseError('TOO_MANY_ROWS');

  const entries: RawEntry[] = [];
  const issues: OfxStatement['issues'] = [];

  blocks.forEach((rawBlock, index) => {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0];
    // A "linha" de um OFX é a ordem do lançamento: é o que permite à pessoa
    // localizar o registro problemático dentro do arquivo.
    const lineNumber = index + 1;

    const amountText = leaf(block, 'TRNAMT');
    const dateText = leaf(block, 'DTPOSTED');

    if (!amountText) {
      issues.push({ lineNumber, code: 'AMOUNT_MISSING', message: 'O lançamento não traz TRNAMT.' });
      return;
    }
    if (!dateText) {
      issues.push({ lineNumber, code: 'DATE_MISSING', message: 'O lançamento não traz DTPOSTED.' });
      return;
    }

    let occurredOn: Date;
    try {
      occurredOn = parseOfxDate(dateText);
    } catch {
      issues.push({ lineNumber, code: 'DATE_UNREADABLE', message: 'A data do lançamento não pôde ser interpretada.' });
      return;
    }

    let amountCents: bigint;
    try {
      // OFX usa ponto decimal e traz o sinal no próprio valor.
      amountCents = parseAmountCents(amountText, '.').cents;
    } catch {
      issues.push({ lineNumber, code: 'AMOUNT_UNREADABLE', message: 'O valor do lançamento não pôde ser interpretado.' });
      return;
    }

    if (amountCents === 0n) {
      issues.push({ lineNumber, code: 'AMOUNT_ZERO', message: 'O lançamento tem valor zero.' });
      return;
    }

    const memo = leaf(block, 'MEMO');
    const name = leaf(block, 'NAME');
    const description = collapseWhitespace([name, memo].filter(Boolean).join(' · '), MAX_DESCRIPTION_CHARS);

    entries.push({
      lineNumber,
      occurredOn,
      description: description.length > 0 ? description : 'Lançamento sem descrição',
      amountCents,
      externalId: leaf(block, 'FITID')?.slice(0, 200) ?? null,
      balanceAfterCents: null,
    });
  });

  const tranList = body.match(/<BANKTRANLIST>([\s\S]*?)(?:<\/BANKTRANLIST>|<LEDGERBAL>)/i)?.[1] ?? '';
  const ledger = body.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i)?.[1] ?? '';
  const account = body.match(/<BANKACCTFROM>([\s\S]*?)(?:<\/BANKACCTFROM>|<BANKTRANLIST>)/i)?.[1] ?? '';

  const readDate = (value: string | null) => {
    if (!value) return null;
    try {
      return parseOfxDate(value);
    } catch {
      return null;
    }
  };

  const balanceText = leaf(ledger, 'BALAMT');
  let ledgerBalanceCents: bigint | null = null;
  if (balanceText) {
    try {
      ledgerBalanceCents = parseAmountCents(balanceText, '.').cents;
    } catch {
      ledgerBalanceCents = null;
    }
  }

  return {
    entries,
    issues,
    currency: leaf(body, 'CURDEF'),
    accountId: leaf(account, 'ACCTID'),
    bankId: leaf(account, 'BANKID'),
    accountType: leaf(account, 'ACCTTYPE'),
    periodStart: readDate(leaf(tranList, 'DTSTART')),
    periodEnd: readDate(leaf(tranList, 'DTEND')),
    ledgerBalanceCents,
    ledgerBalanceAt: readDate(leaf(ledger, 'DTASOF')),
  };
}
