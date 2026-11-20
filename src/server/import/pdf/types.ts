/* Contrato dos leitores de layout de PDF.

   Cada layout (de uma instituição, ou genérico) é um módulo puro que recebe as
   linhas extraídas e devolve lançamentos com a confiança de cada campo. O
   registro em `registry.ts` escolhe o leitor; o passo de inspeção decide o que
   entra no lote e o que vira problema declarado. Como adicionar um layout está
   em docs/ARCHITECTURE.md, §2.5. */

import type { RawEntry } from '../csv.ts';
import type { ImportIssueDraft } from '../inspect.ts';
import type { PdfText } from './extract.ts';

/** Confiança de 0 a 1 em cada campo lido, e a do lançamento (a menor delas). */
export type FieldConfidence = {
  date: number;
  amount: number;
  description: number;
  overall: number;
};

/** Lançamento lido de PDF. O sinal segue a convenção do extrato: negativo é saída. */
export type PdfEntry = RawEntry & {
  page: number;
  confidence: FieldConfidence;
};

/** `bank`: extrato de conta. `card`: fatura de cartão, em que valor sem sinal é compra. */
export type PdfStatementKind = 'bank' | 'card';

/** O que o próprio documento declara sobre o período, quando declara. */
export type PdfDeclaredSummary = {
  dueDate: Date | null;
  closingDate: Date | null;
  totalCents: bigint | null;
};

export type ParsedPdfStatement = {
  kind: PdfStatementKind;
  entries: PdfEntry[];
  issues: ImportIssueDraft[];
  declared: PdfDeclaredSummary;
  closingBalance: { cents: bigint; capturedAt: Date } | null;
};

export type PdfLayoutParser = {
  /** Identificador estável. Nunca reutilize o id de um leitor removido. */
  id: string;
  /** Sobe a cada mudança de regra de leitura, para que o lote saiba qual versão o leu. */
  version: number;
  /** Nome exibido na prévia. */
  name: string;
  kind: PdfStatementKind;
  /** Quanto o documento se parece com este layout, de 0 a 1. */
  detect: (document: PdfText) => number;
  parse: (document: PdfText) => ParsedPdfStatement;
};
