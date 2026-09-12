/* Inspeção do extrato: o passo que não grava nada.

   `docs/ROUTING_MVP.md`, Feature 4, exige mostrar a prévia antes de gravar
   transações. Este módulo é esse passo. Ele decide formato, dialeto e
   mapeamento, converte as linhas, apura problemas e calcula a impressão digital
   — tudo em memória, sem Prisma e sem disco.

   Nada aqui confia no nome, na extensão ou no tipo declarado do arquivo: o
   formato é decidido pelo conteúdo, como `docs/SECURITY.md` exige. */

import { createHash } from 'node:crypto';
import {
  convertRow,
  readCsvTable,
  suggestMapping,
  type CsvDialect,
  type CsvMapping,
  type RawEntry,
} from './csv.ts';
import { MAX_FILE_BYTES, MAX_ROWS, PREVIEW_ROWS } from './limits.ts';
import { looksLikeOfx, parseOfx } from './ofx.ts';
import { decodeStatement } from './text.ts';
import { endOfCivilDay } from './values.ts';

export type StatementFormat = 'csv' | 'ofx';

export type ImportIssueDraft = {
  lineNumber: number;
  severity: 'error' | 'warning';
  code: string;
  message: string;
};

export type StatementInspectErrorCode =
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'BINARY_CONTENT'
  | 'UNREADABLE_ENCODING'
  | 'UNSUPPORTED_FORMAT'
  | 'NO_ROWS'
  | 'TOO_MANY_ROWS'
  | 'NO_USABLE_ROWS'
  | 'MAPPING_INCOMPLETE';

export class StatementInspectError extends Error {
  readonly code: StatementInspectErrorCode;

  constructor(code: StatementInspectErrorCode) {
    super(code);
    this.name = 'StatementInspectError';
    this.code = code;
  }
}

export type ClosingBalance = { cents: bigint; capturedAt: Date } | null;

export type StatementInspection = {
  format: StatementFormat;
  encoding: string;
  repairedEncoding: boolean;
  fingerprint: string;
  /** Dialeto CSV detectado. `null` em OFX, que não tem dialeto configurável. */
  dialect: CsvDialect | null;
  headers: string[] | null;
  mapping: CsvMapping | null;
  entries: RawEntry[];
  issues: ImportIssueDraft[];
  periodStart: Date | null;
  periodEnd: Date | null;
  closingBalance: ClosingBalance;
  /** Identificação da conta declarada pelo arquivo, quando existir (OFX). */
  declaredAccount: { bankId: string | null; accountId: string | null; accountType: string | null } | null;
  currency: string | null;
  duplicateExternalIds: number;
};

/**
 * Impressão digital do arquivo.
 *
 * Calculada sobre o texto já decodificado e com as quebras de linha
 * normalizadas: o mesmo extrato reexportado com CRLF em vez de LF continua
 * sendo o mesmo extrato, e precisa ser reconhecido como duplicado.
 */
export function fingerprintOf(text: string): string {
  const normalized = text.replace(/\r\n|\r/g, '\n').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Descobre se o arquivo vem do lançamento mais novo para o mais antigo.
 *
 * As datas resolvem o caso comum. Quando não resolvem — extrato de um único
 * dia, ou com todos os lançamentos na mesma data — a coluna de saldo corrente
 * desempata: em um arquivo decrescente, o saldo de uma linha menos o valor dela
 * é o saldo da linha seguinte. Testar a cadeia nos dois sentidos e ficar com a
 * que fecha é mais confiável do que supor a ordem.
 *
 * Devolve `null` quando nenhum dos dois sinais decide.
 */
function detectDescending(entries: RawEntry[]): boolean | null {
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (first.occurredOn > last.occurredOn) return true;
  if (first.occurredOn < last.occurredOn) return false;

  const chain = entries.filter((entry) => entry.balanceAfterCents !== null);
  if (chain.length < 2) return null;

  let descendingFits = true;
  let ascendingFits = true;
  for (let index = 1; index < chain.length; index += 1) {
    const previous = chain[index - 1];
    const current = chain[index];
    // Decrescente: o saldo anterior já inclui o próprio lançamento; tirá-lo
    // devolve o saldo da linha seguinte, que é mais antiga.
    if ((previous.balanceAfterCents as bigint) - previous.amountCents !== current.balanceAfterCents) {
      descendingFits = false;
    }
    // Crescente: o saldo da linha atual é o anterior mais o valor dela.
    if ((previous.balanceAfterCents as bigint) + current.amountCents !== current.balanceAfterCents) {
      ascendingFits = false;
    }
  }

  if (descendingFits === ascendingFits) return null;
  return descendingFits;
}

/**
 * Deriva o saldo de fechamento a partir da coluna de saldo corrente.
 *
 * O saldo que interessa é o posterior ao último lançamento do arquivo. Como o
 * extrato pode vir do mais novo para o mais antigo ou o contrário, a ordenação
 * é inferida antes de escolher a linha — pegar sempre a primeira ou sempre a
 * última produziria o saldo de abertura na metade dos bancos.
 *
 * Sem conseguir determinar a ordem, nenhum saldo é derivado: um saldo de
 * abertura apresentado como saldo atual é pior do que saldo desconhecido, que o
 * painel sabe declarar (docs/DASHBOARD.md, I-1).
 */
export function deriveClosingBalance(entries: RawEntry[]): ClosingBalance {
  const withBalance = entries.filter((entry) => entry.balanceAfterCents !== null);
  if (withBalance.length === 0) return null;

  const latest = withBalance.reduce(
    (max, entry) => (entry.occurredOn > max ? entry.occurredOn : max),
    withBalance[0].occurredOn,
  );
  const sameDay = withBalance.filter((entry) => entry.occurredOn.getTime() === latest.getTime());
  if (sameDay.length === 1) {
    return { cents: sameDay[0].balanceAfterCents as bigint, capturedAt: endOfCivilDay(latest) };
  }

  const descending = detectDescending(entries);
  if (descending === null) return null;

  const chosen = descending ? sameDay[0] : sameDay[sameDay.length - 1];

  // O saldo é ancorado no fim do dia civil: assim os lançamentos daquele mesmo
  // dia não são somados de novo pelo painel, que só conta o que veio depois.
  return { cents: chosen.balanceAfterCents as bigint, capturedAt: endOfCivilDay(latest) };
}

function periodOf(entries: RawEntry[]): { periodStart: Date | null; periodEnd: Date | null } {
  if (entries.length === 0) return { periodStart: null, periodEnd: null };
  let start = entries[0].occurredOn;
  let end = entries[0].occurredOn;
  for (const entry of entries) {
    if (entry.occurredOn < start) start = entry.occurredOn;
    if (entry.occurredOn > end) end = entry.occurredOn;
  }
  return { periodStart: start, periodEnd: end };
}

/** Conta identificadores repetidos dentro do próprio arquivo. */
function countDuplicateExternalIds(entries: RawEntry[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const entry of entries) {
    if (!entry.externalId) continue;
    if (seen.has(entry.externalId)) duplicates += 1;
    else seen.add(entry.externalId);
  }
  return duplicates;
}

export type InspectOptions = {
  /** Dialeto confirmado pela pessoa; sobrepõe a detecção automática. */
  dialect?: Partial<CsvDialect>;
  /** Mapeamento confirmado pela pessoa; sobrepõe a sugestão automática. */
  mapping?: CsvMapping;
};

/**
 * Inspeciona os bytes de um extrato e devolve tudo o que a decisão exige.
 *
 * Não grava, não cria conta, não altera nada. É seguro chamar quantas vezes
 * forem necessárias enquanto a pessoa ajusta o mapeamento.
 */
export function inspectStatement(bytes: Uint8Array, options: InspectOptions = {}): StatementInspection {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new StatementInspectError('FILE_TOO_LARGE');

  let decoded;
  try {
    decoded = decodeStatement(bytes);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'EMPTY_FILE' || code === 'BINARY_CONTENT' || code === 'UNREADABLE_ENCODING') {
      throw new StatementInspectError(code);
    }
    throw new StatementInspectError('UNSUPPORTED_FORMAT');
  }

  const fingerprint = fingerprintOf(decoded.text);

  if (looksLikeOfx(decoded.text)) {
    const statement = parseOfx(decoded.text);
    const issues: ImportIssueDraft[] = statement.issues.map((issue) => ({ ...issue, severity: 'error' as const }));
    if (statement.entries.length === 0) throw new StatementInspectError('NO_USABLE_ROWS');

    const period = periodOf(statement.entries);
    const closingBalance =
      statement.ledgerBalanceCents !== null
        ? {
            cents: statement.ledgerBalanceCents,
            capturedAt: endOfCivilDay(statement.ledgerBalanceAt ?? period.periodEnd ?? statement.entries[0].occurredOn),
          }
        : null;

    return {
      format: 'ofx',
      encoding: decoded.encoding,
      repairedEncoding: decoded.repaired,
      fingerprint,
      dialect: null,
      headers: null,
      mapping: null,
      entries: statement.entries,
      issues,
      periodStart: statement.periodStart ?? period.periodStart,
      periodEnd: statement.periodEnd ?? period.periodEnd,
      closingBalance,
      declaredAccount: {
        bankId: statement.bankId,
        accountId: statement.accountId,
        accountType: statement.accountType,
      },
      currency: statement.currency,
      duplicateExternalIds: countDuplicateExternalIds(statement.entries),
    };
  }

  let table;
  try {
    table = readCsvTable(decoded.text, options.dialect);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'NO_ROWS') throw new StatementInspectError('NO_ROWS');
    if (code === 'TOO_MANY_ROWS') throw new StatementInspectError('TOO_MANY_ROWS');
    throw new StatementInspectError('UNSUPPORTED_FORMAT');
  }

  if (table.rows.length > MAX_ROWS) throw new StatementInspectError('TOO_MANY_ROWS');

  const mapping = options.mapping ?? suggestMapping(table);
  const hasDate = mapping.roles.includes('date');
  const hasValue =
    mapping.roles.includes('amount') || mapping.roles.includes('debitAmount') || mapping.roles.includes('creditAmount');

  // Sem data ou sem valor não existe lançamento. Importar assim mesmo produziria
  // um lote de linhas vazias e um saldo inventado.
  if (!hasDate || !hasValue) throw new StatementInspectError('MAPPING_INCOMPLETE');

  const entries: RawEntry[] = [];
  const issues: ImportIssueDraft[] = [];

  for (const row of table.rows) {
    const outcome = convertRow(row, mapping, table.dialect);
    if (outcome.ok) entries.push(outcome.entry);
    else issues.push({ lineNumber: outcome.lineNumber, severity: 'error', code: outcome.code, message: outcome.message });
  }

  if (entries.length === 0) throw new StatementInspectError('NO_USABLE_ROWS');

  const period = periodOf(entries);

  return {
    format: 'csv',
    encoding: decoded.encoding,
    repairedEncoding: decoded.repaired,
    fingerprint,
    dialect: table.dialect,
    headers: table.headers,
    mapping,
    entries,
    issues,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    closingBalance: deriveClosingBalance(entries),
    declaredAccount: null,
    currency: null,
    duplicateExternalIds: countDuplicateExternalIds(entries),
  };
}

/** Amostra devolvida ao frontend. A prévia é amostra, nunca o lote inteiro. */
export function previewOf(inspection: StatementInspection) {
  return inspection.entries.slice(0, PREVIEW_ROWS).map((entry) => ({
    lineNumber: entry.lineNumber,
    occurredOn: entry.occurredOn.toISOString(),
    description: entry.description,
    amountCents: entry.amountCents.toString(),
  }));
}
