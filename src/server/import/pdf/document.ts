/* Tipos e erros da extração de texto de PDF, compartilhados pelos dois lados.

   O servidor (`extract.ts`) e o worker isolado (`extract-worker.ts`) falam
   pelos tipos daqui. Este módulo não importa o pdf.js nem `worker_threads`:
   ele pode ser carregado em qualquer um dos dois lados sem arrastar o outro. */

export const PDF_EXTRACT_ERROR_CODES = [
  'UNSUPPORTED_FORMAT',
  'PDF_ENCRYPTED',
  'TOO_MANY_PAGES',
  'PDF_TOO_MUCH_TEXT',
  'PDF_TIMEOUT',
  'PDF_TOO_COMPLEX',
  'PDF_READER_FAILED',
  'NO_ROWS',
] as const;

export type PdfExtractErrorCode = (typeof PDF_EXTRACT_ERROR_CODES)[number];

export class PdfExtractError extends Error {
  readonly code: PdfExtractErrorCode;

  constructor(code: PdfExtractErrorCode) {
    super(code);
    this.name = 'PdfExtractError';
    this.code = code;
  }
}

/** Um trecho de texto e a posição horizontal em que começa, em pontos. */
export type PdfCell = { x: number; text: string };

/** Uma linha visual da página: trechos com a mesma altura, da esquerda para a direita. */
export type PdfLine = {
  /** Número da linha no documento inteiro, contado a partir de 1. */
  lineNumber: number;
  page: number;
  cells: PdfCell[];
  /** Os trechos unidos por espaço, já sem espaços repetidos. */
  text: string;
};

export type PdfText = {
  pageCount: number;
  lines: PdfLine[];
  charCount: number;
  /**
   * O arquivo declara JavaScript, arquivo embutido, ação automática ou XFA.
   * Nada disso é executado; o aviso existe para que a pessoa saiba.
   */
  activeContent: boolean;
};

export type ExtractLimits = {
  maxPages?: number;
  maxChars?: number;
  /** Prazo cooperativo dentro do worker, conferido a cada passo assíncrono. */
  timeoutMs?: number;
};

/** Assinatura `%PDF-` nos primeiros bytes. A especificação tolera lixo antes dela. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, Math.min(bytes.byteLength, 1024));
  for (let index = 0; index + 4 < head.byteLength; index += 1) {
    if (
      head[index] === 0x25 &&
      head[index + 1] === 0x50 &&
      head[index + 2] === 0x44 &&
      head[index + 3] === 0x46 &&
      head[index + 4] === 0x2d
    ) {
      return true;
    }
  }
  return false;
}
