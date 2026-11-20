/* Extração defensiva de texto de PDF.

   Um PDF é entrada hostil (docs/SECURITY.md, "Files, AI and hostile content").
   Este módulo só extrai texto posicionado; ele não renderiza, não executa e não
   busca nada fora dos bytes recebidos. As decisões estão no ADR 0006:

   - nenhum `eval` nem `new Function`: o pdf.js 6 não os usa, e
     `isEvalSupported: false` segue declarado contra rebaixamento de versão;
   - `enableXfa: false` e nenhuma chamada à API de scripting: JavaScript e
     formulários XFA embutidos nunca rodam;
   - `disableFontFace`, `useSystemFonts: false`, sem URL de fontes padrão e
     sem URL de CMaps: nenhuma fonte ou tabela é buscada no disco ou na rede;
   - `useWorkerFetch: false`, `disableAutoFetch`, `disableStream`: o documento
     inteiro já está em memória e nada é pedido por intervalo;
   - o worker do pdf.js é o módulo local, carregado no mesmo processo (worker
     falso). Nenhum script é baixado.

   Tetos: bytes (checados na borda do upload), páginas, caracteres extraídos e
   tempo. Estourar qualquer um recusa o arquivo inteiro: truncar omitiria
   lançamentos em silêncio. */

import { MAX_PDF_CHARS, MAX_PDF_PAGES, MAX_ROWS, PDF_PARSE_TIMEOUT_MS } from '../limits.ts';

export type PdfExtractErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'PDF_ENCRYPTED'
  | 'TOO_MANY_PAGES'
  | 'PDF_TOO_MUCH_TEXT'
  | 'PDF_TIMEOUT'
  | 'NO_ROWS';

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

const ACTIVE_MARKERS = /\/(JavaScript|JS|EmbeddedFile|EmbeddedFiles|Launch|OpenAction|AA|XFA|RichMedia|SubmitForm|ImportData)\b/;

/**
 * Procura marcadores de conteúdo ativo nos bytes crus.
 *
 * É informativo, não proteção: um objeto comprimido pode escondê-los. A
 * proteção é nunca executar nada, garantida pelas opções de `getDocument`.
 */
export function declaresActiveContent(bytes: Uint8Array): boolean {
  // latin1 mapeia cada byte em um caractere, sem falhar em sequência inválida.
  const text = new TextDecoder('latin1').decode(bytes);
  return ACTIVE_MARKERS.test(text);
}

type TextItemLike = { str?: unknown; transform?: unknown };

/** Agrupa os trechos de uma página em linhas visuais. */
function linesOfPage(items: TextItemLike[]): { y: number; cells: PdfCell[] }[] {
  const rows: { y: number; cells: PdfCell[] }[] = [];
  // Tolerância vertical em pontos: trechos da mesma linha podem variar meio ponto.
  const tolerance = 2;

  for (const item of items) {
    if (typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
    const text = item.str.replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;
    const x = Number(item.transform[4]);
    const y = Number(item.transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (!row) {
      row = { y, cells: [] };
      rows.push(row);
    }
    row.cells.push({ x, text });
  }

  // PDF mede y de baixo para cima: a linha de cima tem o maior y.
  rows.sort((left, right) => right.y - left.y);
  for (const row of rows) row.cells.sort((left, right) => left.x - right.x);
  return rows;
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * Carrega o pdf.js e o worker local uma única vez.
 *
 * Importar o módulo do worker registra `globalThis.pdfjsWorker`, e o pdf.js
 * passa a usá-lo no mesmo processo em vez de tentar criar um worker a partir de
 * uma URL. Nada é buscado fora de `node_modules`.
 */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
      return import('pdfjs-dist/legacy/build/pdf.mjs');
    })();
  }
  return pdfjsPromise;
}

export type ExtractLimits = {
  maxPages?: number;
  maxChars?: number;
  timeoutMs?: number;
};

/**
 * Extrai as linhas de texto de um PDF, dentro dos tetos.
 *
 * Os bytes são copiados antes de entregues ao pdf.js, que transfere o buffer
 * para o worker e o deixaria inutilizável para quem chamou.
 */
export async function extractPdfText(bytes: Uint8Array, limits: ExtractLimits = {}): Promise<PdfText> {
  const maxPages = limits.maxPages ?? MAX_PDF_PAGES;
  const maxChars = limits.maxChars ?? MAX_PDF_CHARS;
  const timeoutMs = limits.timeoutMs ?? PDF_PARSE_TIMEOUT_MS;

  if (!looksLikePdf(bytes)) throw new PdfExtractError('UNSUPPORTED_FORMAT');
  const activeContent = declaresActiveContent(bytes);

  const pdfjs = await loadPdfJs();
  /* O pdf.js 6 não tem mais caminho com `eval` ou `new Function` (o teste
     confere nos bundles). A opção continua aqui para que um rebaixamento de
     versão não reabra esse caminho em silêncio; ela fica fora do literal porque
     os tipos da versão 6 já não a declaram. */
  const hardening: Record<string, unknown> = { isEvalSupported: false };
  const task = pdfjs.getDocument({
    ...hardening,
    data: bytes.slice(),
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfExtractError('PDF_TIMEOUT')), timeoutMs);
  });

  /* O relógio é conferido a cada passo assíncrono, além da corrida com o
     temporizador: o pdf.js roda no mesmo processo, e uma sequência de passos
     que nunca devolve o controle ao laço de eventos não deixaria o temporizador
     disparar. Uma única operação síncrona longa ainda não é interrompível; isso
     exige isolar a leitura num worker (docs/SECURITY.md, Open items). */
  const deadline = Date.now() + timeoutMs;
  const checkClock = () => {
    if (Date.now() >= deadline) throw new PdfExtractError('PDF_TIMEOUT');
  };

  const work = (async (): Promise<PdfText> => {
    const document = await task.promise;
    checkClock();
    if (document.numPages > maxPages) throw new PdfExtractError('TOO_MANY_PAGES');

    const lines: PdfLine[] = [];
    let charCount = 0;
    let lineNumber = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      page.cleanup();
      checkClock();

      for (const row of linesOfPage(content.items as TextItemLike[])) {
        const text = row.cells.map((cell) => cell.text).join(' ').replace(/\s+/g, ' ').trim();
        charCount += text.length;
        if (charCount > maxChars) throw new PdfExtractError('PDF_TOO_MUCH_TEXT');
        lineNumber += 1;
        if (lineNumber > MAX_ROWS) throw new PdfExtractError('PDF_TOO_MUCH_TEXT');
        lines.push({ lineNumber, page: pageNumber, cells: row.cells, text });
      }
    }

    if (lines.length === 0) throw new PdfExtractError('NO_ROWS');
    return { pageCount: document.numPages, lines, charCount, activeContent };
  })();

  try {
    return await Promise.race([work, timeout]);
  } catch (error) {
    if (error instanceof PdfExtractError) throw error;
    const name = (error as { name?: string })?.name;
    if (name === 'PasswordException') throw new PdfExtractError('PDF_ENCRYPTED');
    throw new PdfExtractError('UNSUPPORTED_FORMAT');
  } finally {
    clearTimeout(timer);
    // Libera o documento mesmo quando o tempo estourou no meio da leitura.
    work.catch(() => undefined);
    await task.destroy().catch(() => undefined);
  }
}
