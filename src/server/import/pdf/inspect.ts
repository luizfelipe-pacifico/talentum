/* Inspeção de extrato ou fatura em PDF.

   Mesmo contrato da inspeção de CSV e OFX (`StatementInspection`): nada é
   gravado, e a prévia mostra o que entraria no lote. A diferença é a confiança:
   cada lançamento traz a confiança de data, valor e descrição, e o que fica
   abaixo do mínimo vira problema declarado (`LOW_CONFIDENCE`) em vez de
   lançamento (ADR 0006). */

import { PDF_MIN_CONFIDENCE } from '../limits.ts';
import {
  fingerprintOf,
  StatementInspectError,
  type ImportIssueDraft,
  type StatementInspection,
} from '../inspect.ts';
import { extractPdfText, PdfExtractError, type ExtractLimits } from './extract.ts';
import { selectLayout } from './layouts.ts';
import type { PdfEntry } from './types.ts';

/** Erros do PDF que a borda HTTP traduz para código e mensagem estáveis. */
export const PDF_ERROR_CODES = [
  'PDF_ENCRYPTED',
  'TOO_MANY_PAGES',
  'PDF_TOO_MUCH_TEXT',
  'PDF_TIMEOUT',
  'PDF_TOO_COMPLEX',
  'PDF_READER_FAILED',
] as const;

export class PdfInspectError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'PdfInspectError';
    this.code = code;
  }
}

const FIELD_LABELS: Record<'date' | 'amount' | 'description', string> = {
  date: 'data',
  amount: 'valor ou sinal',
  description: 'descrição',
};

/** O campo de menor confiança, para dizer à pessoa o que conferir. */
function weakestField(entry: PdfEntry): 'date' | 'amount' | 'description' {
  const { date, amount, description } = entry.confidence;
  if (amount <= date && amount <= description) return 'amount';
  if (date <= description) return 'date';
  return 'description';
}

function periodOf(entries: PdfEntry[]): { periodStart: Date | null; periodEnd: Date | null } {
  if (entries.length === 0) return { periodStart: null, periodEnd: null };
  let start = entries[0].occurredOn;
  let end = entries[0].occurredOn;
  for (const entry of entries) {
    if (entry.occurredOn < start) start = entry.occurredOn;
    if (entry.occurredOn > end) end = entry.occurredOn;
  }
  return { periodStart: start, periodEnd: end };
}

export type PdfInspectOptions = { limits?: ExtractLimits; threshold?: number };

export async function inspectPdfStatement(
  bytes: Uint8Array,
  options: PdfInspectOptions = {},
): Promise<StatementInspection> {
  const threshold = options.threshold ?? PDF_MIN_CONFIDENCE;

  let document;
  try {
    document = await extractPdfText(bytes, options.limits);
  } catch (error) {
    if (error instanceof PdfExtractError) {
      if (error.code === 'NO_ROWS') throw new StatementInspectError('NO_ROWS');
      if (error.code === 'UNSUPPORTED_FORMAT') throw new StatementInspectError('UNSUPPORTED_FORMAT');
      throw new PdfInspectError(error.code);
    }
    throw new StatementInspectError('UNSUPPORTED_FORMAT');
  }

  const layout = selectLayout(document);
  const parsed = layout.parse(document);

  const accepted: PdfEntry[] = [];
  const issues: ImportIssueDraft[] = [...parsed.issues];
  let lowConfidenceCount = 0;

  for (const entry of parsed.entries) {
    if (entry.confidence.overall >= threshold) {
      accepted.push(entry);
      continue;
    }
    lowConfidenceCount += 1;
    // A mensagem não repete o conteúdo da linha: o problema fica gravado no lote
    // e o extrato não é retido (docs/SECURITY.md, Statement import).
    issues.push({
      lineNumber: entry.lineNumber,
      severity: 'warning',
      code: 'LOW_CONFIDENCE',
      message: `Leitura incerta do campo ${FIELD_LABELS[weakestField(entry)]} na página ${entry.page}. A linha não foi importada; confira o documento e lance à mão se for preciso.`,
    });
  }

  if (document.activeContent) {
    issues.unshift({
      lineNumber: 0,
      severity: 'warning',
      code: 'PDF_ACTIVE_CONTENT_IGNORED',
      message: 'O PDF declara scripts, anexos ou ações automáticas. Nada disso foi executado; só o texto foi lido.',
    });
  }

  if (accepted.length === 0 && lowConfidenceCount === 0) throw new StatementInspectError('NO_USABLE_ROWS');

  issues.sort((left, right) => left.lineNumber - right.lineNumber);

  // A impressão digital usa o texto extraído, não os bytes: o mesmo extrato
  // baixado de novo muda metadados do PDF e continua sendo o mesmo extrato.
  const fingerprint = fingerprintOf(document.lines.map((line) => line.text).join('\n'));
  const period = periodOf(accepted);

  const confidence: Record<number, PdfEntry['confidence']> = {};
  for (const entry of accepted) confidence[entry.lineNumber] = entry.confidence;

  return {
    format: 'pdf',
    encoding: 'pdf-text',
    repairedEncoding: false,
    fingerprint,
    dialect: null,
    headers: null,
    mapping: null,
    headerSignature: null,
    entries: accepted.map(({ page: _page, confidence: _confidence, ...entry }) => entry),
    issues,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    closingBalance: parsed.closingBalance,
    declaredAccount: null,
    currency: null,
    duplicateExternalIds: 0,
    pdf: {
      parserId: layout.id,
      parserVersion: layout.version,
      parserName: layout.name,
      kind: parsed.kind,
      pageCount: document.pageCount,
      confidence,
      lowConfidenceCount,
      threshold,
      activeContent: document.activeContent,
      declared: parsed.declared,
    },
  };
}
