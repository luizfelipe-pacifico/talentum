/* Leitores de layout de PDF e o registro que escolhe entre eles.

   Registro pequeno e versionado (ADR 0006). Cada leitor declara `id`,
   `version`, o tipo de documento e uma função `detect` que mede a semelhança do
   documento com o layout. O de maior pontuação lê o arquivo; o leitor tabular
   genérico é o último recurso e sempre aceita.

   Os leitores incluídos são genéricos de propósito: nenhum foi escrito a partir
   do extrato real de uma instituição, e por isso nenhum leva nome de banco. Um
   leitor específico de instituição só entra com fixture sintética que reproduza
   o layout e teste próprio (docs/ARCHITECTURE.md, §2.5). */

import type { ImportIssueDraft } from '../inspect.ts';
import type { PdfText } from './extract.ts';
import { documentUsesSigns, findLabeledAmount, findLabeledDate, normalizeText, readLine } from './lines.ts';
import type { ParsedPdfStatement, PdfEntry, PdfLayoutParser, PdfStatementKind } from './types.ts';

const ISSUE_MESSAGES: Record<string, string> = {
  AMOUNT_UNREADABLE: 'A linha começa com uma data, mas o valor não pôde ser lido.',
  AMOUNT_ZERO: 'A linha tem valor zero e não é um lançamento.',
};

/** Lê todas as linhas com as regras comuns e separa lançamento, saldo e problema. */
function readAll(document: PdfText, kind: PdfStatementKind, reference: Date | null) {
  const context = { kind, reference, documentUsesSigns: documentUsesSigns(document.lines) };
  const entries: PdfEntry[] = [];
  const issues: ImportIssueDraft[] = [];
  let lastBalance: { occurredOn: Date; cents: bigint } | null = null;

  for (const line of document.lines) {
    const reading = readLine(line, context);
    if (reading.kind === 'entry') entries.push(reading.entry);
    else if (reading.kind === 'balance') {
      if (!lastBalance || reading.occurredOn >= lastBalance.occurredOn) lastBalance = reading;
    } else if (reading.kind === 'issue') {
      issues.push({
        lineNumber: line.lineNumber,
        severity: 'error',
        code: reading.code,
        message: `${ISSUE_MESSAGES[reading.code] ?? 'A linha não pôde ser lida.'} Página ${line.page}.`,
      });
    }
  }

  return { entries, issues, lastBalance };
}

/** Quantos dos rótulos aparecem no texto do documento. */
function countLabels(document: PdfText, labels: RegExp[]): number {
  const text = normalizeText(document.lines.map((line) => line.text).join(' \n '));
  return labels.filter((label) => label.test(text)).length;
}

/**
 * Fatura de cartão genérica.
 *
 * Reconhece documentos que declaram fatura, vencimento e total. Lê o
 * vencimento, o fechamento e o total declarados, e trata valor sem sinal como
 * compra.
 */
export const genericCardStatement: PdfLayoutParser = {
  id: 'fatura-cartao-generica',
  version: 1,
  name: 'Fatura de cartão genérica',
  kind: 'card',
  detect(document) {
    const required = countLabels(document, [/\bfatura\b/, /\bvencimento\b/]);
    if (required < 2) return 0;
    const extra = countLabels(document, [/\btotal\b/, /\bcartao\b/, /\bfechamento\b/, /\blimite\b/]);
    return Math.min(1, 0.5 + extra * 0.125);
  },
  parse(document) {
    const dueDate = findLabeledDate(document.lines, /\bvencimento\b/);
    const closingDate = findLabeledDate(document.lines, /\bfechamento\b|\bdata de corte\b/);
    const totalCents = findLabeledAmount(document.lines, /\btotal (da fatura|a pagar|desta fatura)\b|\bvalor total\b/);
    const { entries, issues } = readAll(document, 'card', dueDate ?? closingDate);
    return {
      kind: 'card',
      entries,
      issues,
      declared: { dueDate, closingDate, totalCents },
      // Fatura não tem saldo de conta: o total é dívida, não saldo disponível.
      closingBalance: null,
    } satisfies ParsedPdfStatement;
  },
};

/**
 * Extrato tabular genérico: o último recurso.
 *
 * Cada linha que começa com data e termina com valor vira lançamento. Linhas de
 * saldo são reconhecidas pelo rótulo e alimentam o saldo de fechamento; nunca
 * viram lançamento.
 */
export const genericTabular: PdfLayoutParser = {
  id: 'extrato-tabular-generico',
  version: 1,
  name: 'Extrato em tabela genérico',
  kind: 'bank',
  detect() {
    return 0.1;
  },
  parse(document) {
    const reference = findLabeledDate(document.lines, /\bperiodo\b|\bate\b|\bemissao\b|\bgerado em\b/);
    const { entries, issues, lastBalance } = readAll(document, 'bank', reference);
    return {
      kind: 'bank',
      entries,
      issues,
      declared: { dueDate: null, closingDate: null, totalCents: null },
      closingBalance: lastBalance
        ? {
            cents: lastBalance.cents,
            capturedAt: new Date(
              lastBalance.occurredOn.getFullYear(),
              lastBalance.occurredOn.getMonth(),
              lastBalance.occurredOn.getDate(),
              23,
              59,
              59,
              999,
            ),
          }
        : null,
    } satisfies ParsedPdfStatement;
  },
};

/**
 * Registro, em ordem de prioridade para desempate.
 *
 * Para adicionar um layout: escreva o leitor neste formato, coloque-o antes dos
 * genéricos, crie a fixture sintética e o teste em `tests/import-pdf.test.mjs`.
 */
export const PDF_LAYOUTS: readonly PdfLayoutParser[] = [genericCardStatement, genericTabular];

/** Escolhe o leitor de maior pontuação; o genérico tabular sempre responde. */
export function selectLayout(document: PdfText, layouts: readonly PdfLayoutParser[] = PDF_LAYOUTS): PdfLayoutParser {
  let best = genericTabular;
  let bestScore = -1;
  for (const layout of layouts) {
    const score = layout.detect(document);
    if (score > bestScore) {
      best = layout;
      bestScore = score;
    }
  }
  return best;
}
