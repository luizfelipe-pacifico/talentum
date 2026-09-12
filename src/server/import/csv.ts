/* Leitura de CSV de extrato bancário.

   Módulo puro. Não existe "o" CSV de extrato: cada banco escolhe separador,
   codificação, ordem de colunas, formato de data e como representar o sinal do
   valor. Por isso o fluxo de `docs/ROUTING_MVP.md` (Feature 4) separa inspeção
   de importação — primeiro o backend propõe um mapeamento, a pessoa confere, e
   só então os lançamentos são gravados.

   Nada aqui persiste, e nada aqui confia no nome ou na extensão do arquivo. */

import { MAX_COLUMNS, MAX_ROWS } from './limits.ts';
import { collapseWhitespace, normalizeLabel, splitLines } from './text.ts';
import { MAX_DESCRIPTION_CHARS } from './limits.ts';
import { parseAmountCents, parseCivilDate, ValueParseError, type DecimalSeparator } from './values.ts';

export type ColumnRole =
  | 'date'
  | 'description'
  | 'amount'
  | 'debitAmount'
  | 'creditAmount'
  | 'direction'
  | 'externalId'
  | 'balance'
  | 'document'
  | 'ignore';

export type CsvDialect = {
  separator: string;
  hasHeader: boolean;
  decimalSeparator: DecimalSeparator;
};

export type CsvMapping = {
  /** Papel de cada coluna, na ordem do arquivo. */
  roles: ColumnRole[];
};

export type CsvTable = {
  dialect: CsvDialect;
  headers: string[] | null;
  rows: { lineNumber: number; fields: string[] }[];
  columnCount: number;
};

export type CsvParseErrorCode = 'NO_ROWS' | 'TOO_MANY_ROWS' | 'TOO_MANY_COLUMNS' | 'NO_SEPARATOR';

export class CsvParseError extends Error {
  readonly code: CsvParseErrorCode;

  constructor(code: CsvParseErrorCode) {
    super(code);
    this.name = 'CsvParseError';
    this.code = code;
  }
}

const CANDIDATE_SEPARATORS = [';', ',', '\t', '|'];

/**
 * Divide uma linha respeitando aspas duplas no estilo RFC 4180.
 *
 * Um separador dentro de aspas é conteúdo, não separador — descrições de
 * extrato trazem vírgula com frequência, e um `split` ingênuo partiria o campo
 * ao meio deslocando todas as colunas seguintes.
 */
export function splitCsvLine(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' && current.trim().length === 0) {
      quoted = true;
      current = '';
      continue;
    }

    if (char === separator) {
      fields.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Escolhe o separador pela consistência da contagem de colunas.
 *
 * O candidato vencedor é o que produz mais de uma coluna e o mesmo número de
 * colunas na maior parte das linhas. Frequência isolada não serve: em extrato
 * brasileiro a vírgula aparece dentro de todo valor e venceria por contagem.
 */
export function detectSeparator(lines: string[]): string {
  let best: { separator: string; columns: number; score: number } | null = null;

  for (const separator of CANDIDATE_SEPARATORS) {
    const counts = lines.map((line) => splitCsvLine(line, separator).length);
    const columns = counts[0] ?? 1;
    if (columns < 2) continue;
    const consistent = counts.filter((count) => count === columns).length;
    const score = consistent / counts.length + columns / 1000;
    if (!best || score > best.score) best = { separator, columns, score };
  }

  if (!best) throw new CsvParseError('NO_SEPARATOR');
  return best.separator;
}

const ROLE_BY_LABEL: { role: ColumnRole; labels: string[] }[] = [
  { role: 'date', labels: ['data', 'datalancamento', 'datamovimento', 'datadaoperacao', 'dataoperacao', 'dtposted', 'date', 'datacompra', 'dataefetivacao'] },
  { role: 'description', labels: ['descricao', 'historico', 'lancamento', 'memo', 'description', 'detalhe', 'detalhamento', 'estabelecimento', 'observacao'] },
  { role: 'debitAmount', labels: ['valordebito', 'debito', 'saida', 'saidas', 'debitos'] },
  { role: 'creditAmount', labels: ['valorcredito', 'credito', 'entrada', 'entradas', 'creditos'] },
  { role: 'amount', labels: ['valor', 'valorrs', 'amount', 'montante', 'valordatransacao', 'valorlancamento', 'trnamt'] },
  { role: 'direction', labels: ['tipo', 'tipolancamento', 'dc', 'debitocredito', 'natureza', 'tipomovimento', 'trntype'] },
  { role: 'externalId', labels: ['identificador', 'idtransacao', 'fitid', 'nsu', 'autenticacao', 'codigoidentificador', 'enditoendid', 'idendtoendid'] },
  { role: 'balance', labels: ['saldo', 'saldoapos', 'saldofinal', 'balance', 'saldoatual'] },
  { role: 'document', labels: ['codtransacao', 'documento', 'numerodocumento', 'numdocumento', 'doc', 'codigo', 'checknum'] },
];

function roleForLabel(label: string): ColumnRole | null {
  const normalized = normalizeLabel(label);
  if (normalized.length === 0) return null;
  for (const entry of ROLE_BY_LABEL) {
    if (entry.labels.includes(normalized)) return entry.role;
  }
  for (const entry of ROLE_BY_LABEL) {
    if (entry.labels.some((candidate) => normalized.startsWith(candidate))) return entry.role;
  }
  return null;
}

/** Uma linha é cabeçalho quando nenhum campo se parece com data ou com valor. */
function looksLikeHeader(fields: string[]): boolean {
  const named = fields.filter((field) => roleForLabel(field) !== null).length;
  if (named >= 2) return true;

  let parsable = 0;
  for (const field of fields) {
    try {
      parseCivilDate(field);
      parsable += 1;
      continue;
    } catch {
      /* segue para o teste de valor */
    }
    try {
      parseAmountCents(field);
      parsable += 1;
    } catch {
      /* campo textual */
    }
  }
  return parsable === 0;
}

/** Lê o arquivo em tabela: dialeto, cabeçalho e linhas de dado. */
export function readCsvTable(text: string, forced?: Partial<CsvDialect>): CsvTable {
  const lines = splitLines(text);
  if (lines.length === 0) throw new CsvParseError('NO_ROWS');
  if (lines.length > MAX_ROWS) throw new CsvParseError('TOO_MANY_ROWS');

  const separator = forced?.separator ?? detectSeparator(lines.slice(0, 30).map((line) => line.content));
  const parsed = lines.map((line) => ({ lineNumber: line.lineNumber, fields: splitCsvLine(line.content, separator) }));

  const columnCount = parsed[0].fields.length;
  if (columnCount > MAX_COLUMNS) throw new CsvParseError('TOO_MANY_COLUMNS');

  const hasHeader = forced?.hasHeader ?? looksLikeHeader(parsed[0].fields);
  const headers = hasHeader ? parsed[0].fields : null;
  const rows = hasHeader ? parsed.slice(1) : parsed;
  if (rows.length === 0) throw new CsvParseError('NO_ROWS');

  return {
    dialect: { separator, hasHeader, decimalSeparator: forced?.decimalSeparator ?? 'auto' },
    headers,
    rows,
    columnCount,
  };
}

/**
 * Propõe o papel de cada coluna.
 *
 * Com cabeçalho, o rótulo decide. Sem cabeçalho, decide o conteúdo: a coluna
 * que sempre analisa como data é a data, a coluna textual mais longa é a
 * descrição, e a coluna numérica com sinal é o valor. A proposta é sempre
 * revisável pela pessoa — o backend sugere, não impõe.
 */
export function suggestMapping(table: CsvTable): CsvMapping {
  const roles: ColumnRole[] = new Array(table.columnCount).fill('ignore');
  const sample = table.rows.slice(0, 20);

  if (table.headers) {
    for (let column = 0; column < table.columnCount; column += 1) {
      roles[column] = roleForLabel(table.headers[column] ?? '') ?? 'ignore';
    }
  }

  const columnValues = (column: number) => sample.map((row) => row.fields[column] ?? '');

  const parsesAs = (column: number, parse: (value: string) => unknown) => {
    const values = columnValues(column).filter((value) => value.length > 0);
    if (values.length === 0) return 0;
    let ok = 0;
    for (const value of values) {
      try {
        parse(value);
        ok += 1;
      } catch {
        /* não conta */
      }
    }
    return ok / values.length;
  };

  if (!roles.includes('date')) {
    let bestColumn = -1;
    let bestScore = 0.8;
    for (let column = 0; column < table.columnCount; column += 1) {
      const score = parsesAs(column, parseCivilDate);
      if (score > bestScore) {
        bestScore = score;
        bestColumn = column;
      }
    }
    if (bestColumn >= 0) roles[bestColumn] = 'date';
  }

  if (!roles.includes('amount') && !roles.includes('debitAmount') && !roles.includes('creditAmount')) {
    let bestColumn = -1;
    let bestScore = 0.8;
    for (let column = 0; column < table.columnCount; column += 1) {
      if (roles[column] !== 'ignore') continue;
      const score = parsesAs(column, (value) => parseAmountCents(value));
      if (score > bestScore) {
        bestScore = score;
        bestColumn = column;
      }
    }
    if (bestColumn >= 0) roles[bestColumn] = 'amount';
  }

  if (!roles.includes('description')) {
    let bestColumn = -1;
    let bestLength = 0;
    for (let column = 0; column < table.columnCount; column += 1) {
      if (roles[column] !== 'ignore') continue;
      const values = columnValues(column);
      const numeric = parsesAs(column, (value) => parseAmountCents(value));
      if (numeric > 0.8) continue;
      const averageLength = values.reduce((sum, value) => sum + value.length, 0) / Math.max(values.length, 1);
      if (averageLength > bestLength) {
        bestLength = averageLength;
        bestColumn = column;
      }
    }
    if (bestColumn >= 0 && bestLength >= 4) roles[bestColumn] = 'description';
  }

  return { roles };
}

export type CsvRowOutcome =
  | { ok: true; entry: RawEntry }
  | { ok: false; lineNumber: number; code: string; message: string };

/** Lançamento normalizado, antes de qualquer decisão de persistência. */
export type RawEntry = {
  lineNumber: number;
  occurredOn: Date;
  description: string;
  amountCents: bigint;
  externalId: string | null;
  balanceAfterCents: bigint | null;
};

/** Palavras que, na coluna de tipo, indicam saída de dinheiro. */
const DEBIT_WORDS = ['debito', 'debit', 'saida', 'saque', 'pagamento', 'd'];
/** Palavras que, na coluna de tipo, indicam entrada de dinheiro. */
const CREDIT_WORDS = ['credito', 'credit', 'entrada', 'deposito', 'recebimento', 'c'];

function directionSign(value: string): -1 | 1 | null {
  const normalized = normalizeLabel(value);
  if (normalized.length === 0) return null;
  if (DEBIT_WORDS.includes(normalized)) return -1;
  if (CREDIT_WORDS.includes(normalized)) return 1;
  if (DEBIT_WORDS.some((word) => word.length > 1 && normalized.startsWith(word))) return -1;
  if (CREDIT_WORDS.some((word) => word.length > 1 && normalized.startsWith(word))) return 1;
  return null;
}

/**
 * Converte uma linha em lançamento normalizado.
 *
 * O sinal do valor tem três fontes possíveis, nesta ordem: colunas separadas de
 * débito e crédito, sinal explícito no próprio valor, ou a coluna de tipo. Uma
 * linha cujo sinal não pode ser determinado vira problema declarado, nunca um
 * palpite — um débito importado como crédito corrompe todo o saldo.
 */
export function convertRow(
  row: { lineNumber: number; fields: string[] },
  mapping: CsvMapping,
  dialect: CsvDialect,
): CsvRowOutcome {
  const field = (role: ColumnRole) => {
    const column = mapping.roles.indexOf(role);
    return column === -1 ? '' : (row.fields[column] ?? '').trim();
  };

  const fail = (code: string, message: string): CsvRowOutcome => ({ ok: false, lineNumber: row.lineNumber, code, message });

  const dateText = field('date');
  if (dateText.length === 0) return fail('DATE_MISSING', 'A linha não traz data.');

  let occurredOn: Date;
  try {
    occurredOn = parseCivilDate(dateText);
  } catch (error) {
    const code = error instanceof ValueParseError ? error.code : 'DATE_UNREADABLE';
    return fail(code, 'A data da linha não pôde ser interpretada.');
  }

  const debitText = field('debitAmount');
  const creditText = field('creditAmount');
  const amountText = field('amount');

  let amountCents: bigint | null = null;

  if (debitText.length > 0 || creditText.length > 0) {
    try {
      const debit = debitText.length > 0 ? parseAmountCents(debitText, dialect.decimalSeparator).cents : 0n;
      const credit = creditText.length > 0 ? parseAmountCents(creditText, dialect.decimalSeparator).cents : 0n;
      const magnitude = (value: bigint) => (value < 0n ? -value : value);
      amountCents = magnitude(credit) - magnitude(debit);
    } catch {
      return fail('AMOUNT_UNREADABLE', 'O valor da linha não pôde ser interpretado.');
    }
  } else {
    if (amountText.length === 0) return fail('AMOUNT_MISSING', 'A linha não traz valor.');
    try {
      amountCents = parseAmountCents(amountText, dialect.decimalSeparator).cents;
    } catch {
      return fail('AMOUNT_UNREADABLE', 'O valor da linha não pôde ser interpretado.');
    }

    const sign = directionSign(field('direction'));
    const hasExplicitSign = /[-+]|\(.*\)/.test(amountText);

    if (sign !== null) {
      const magnitude = amountCents < 0n ? -amountCents : amountCents;
      // Sinal explícito e coluna de tipo em desacordo: a coluna de tipo vence,
      // porque é a afirmação do banco sobre a direção do dinheiro.
      amountCents = sign === -1 ? -magnitude : magnitude;
    } else if (!hasExplicitSign && amountCents !== 0n) {
      return fail('DIRECTION_UNKNOWN', 'Não foi possível saber se a linha é entrada ou saída.');
    }
  }

  if (amountCents === 0n) return fail('AMOUNT_ZERO', 'A linha tem valor zero e não é um lançamento.');

  const description = collapseWhitespace(field('description'), MAX_DESCRIPTION_CHARS);
  const externalIdRaw = field('externalId');
  const documentRaw = field('document');
  const externalId = externalIdRaw.length > 0 ? externalIdRaw.slice(0, 200) : null;

  let balanceAfterCents: bigint | null = null;
  const balanceText = field('balance');
  if (balanceText.length > 0) {
    try {
      balanceAfterCents = parseAmountCents(balanceText, dialect.decimalSeparator).cents;
    } catch {
      // Saldo ilegível não invalida o lançamento: ele é informação de apoio.
      balanceAfterCents = null;
    }
  }

  return {
    ok: true,
    entry: {
      lineNumber: row.lineNumber,
      occurredOn,
      description: description.length > 0 ? description : documentRaw || 'Lançamento sem descrição',
      amountCents,
      externalId,
      balanceAfterCents,
    },
  };
}
