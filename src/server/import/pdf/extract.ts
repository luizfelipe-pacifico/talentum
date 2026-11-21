/* Extração de texto de PDF num worker isolado.

   O servidor local guarda a chave do cofre destravado. Um PDF malicioso ou
   malformado que travasse o laço de eventos, esgotasse a memória ou explorasse
   um defeito do parser não pode fazer isso no mesmo processo. Por isso o pdf.js
   roda numa thread própria (`extract-worker.ts`, que usa `read-pdf.ts`), e este
   módulo só a supervisiona:

   - a thread recebe só os bytes do arquivo, com o `ArrayBuffer` transferido, e
     os tetos numéricos; `env: {}` deixa o `process.env` dela vazio, sem
     segredos, e nada do cofre, do banco ou da sessão é passado;
   - `resourceLimits` limita heap e pilha; estourar encerra só a thread
     (`PDF_TOO_COMPLEX`), nunca o servidor;
   - um prazo duro medido aqui encerra a thread com `terminate()`, mesmo no
     meio de um passo síncrono do pdf.js (`PDF_TIMEOUT`);
   - a saída da thread é tratada como não confiável e validada antes de usar;
     forma inesperada vira `PDF_READER_FAILED`;
   - stdout e stderr da thread são descartados: avisos do pdf.js podem citar
     trechos do documento e não entram no log;
   - no máximo `MAX_PDF_WORKERS` threads ao mesmo tempo.

   A decisão e as alternativas (processo filho, `utilityProcess`) estão no
   ADR 0006. */

import { Worker, type WorkerOptions } from 'node:worker_threads';
import { z } from 'zod';
import {
  MAX_PDF_CHARS,
  MAX_PDF_PAGES,
  MAX_PDF_WORKERS,
  MAX_ROWS,
  PDF_PARSE_TIMEOUT_MS,
  PDF_WORKER_MAX_OLD_GENERATION_MB,
  PDF_WORKER_MAX_YOUNG_GENERATION_MB,
  PDF_WORKER_STACK_MB,
  PDF_WORKER_TIMEOUT_MS,
} from '../limits.ts';
import { type ExtractLimits, looksLikePdf, PDF_EXTRACT_ERROR_CODES, PdfExtractError, type PdfText } from './document.ts';

export {
  type ExtractLimits,
  looksLikePdf,
  type PdfCell,
  PdfExtractError,
  type PdfExtractErrorCode,
  type PdfLine,
  type PdfText,
} from './document.ts';

type ResolvedLimits = Required<ExtractLimits>;

function resolveLimits(limits: ExtractLimits): ResolvedLimits {
  return {
    maxPages: limits.maxPages ?? MAX_PDF_PAGES,
    maxChars: limits.maxChars ?? MAX_PDF_CHARS,
    timeoutMs: limits.timeoutMs ?? PDF_PARSE_TIMEOUT_MS,
  };
}

/* Flags do Node que a thread herda. Só as que permitem carregar o próprio
   código TypeScript nos testes (`node --experimental-strip-types`); no build
   do Next a thread é JavaScript compilado e nenhuma delas está presente.
   `--inspect` e afins nunca passam. */
const INHERITED_FLAGS = new Set(['--experimental-strip-types', '--experimental-transform-types', '--no-warnings']);

/**
 * Opções de criação da thread. Exportado para o teste conferir o que a thread
 * recebe: bytes e tetos, ambiente vazio, limites de memória.
 */
export function pdfWorkerOptions(bytes: ArrayBuffer, limits: ExtractLimits = {}): WorkerOptions {
  return {
    workerData: { bytes, limits: resolveLimits(limits) },
    transferList: [bytes],
    env: {},
    argv: [],
    execArgv: process.execArgv.filter((flag) => INHERITED_FLAGS.has(flag)),
    stdin: false,
    stdout: true,
    stderr: true,
    trackUnmanagedFds: true,
    resourceLimits: {
      maxOldGenerationSizeMb: PDF_WORKER_MAX_OLD_GENERATION_MB,
      maxYoungGenerationSizeMb: PDF_WORKER_MAX_YOUNG_GENERATION_MB,
      stackSizeMb: PDF_WORKER_STACK_MB,
    },
  };
}

/* ── Validação da saída ─────────────────────────────────────────── */

function replySchema(limits: ResolvedLimits) {
  // `z.number()` já recusa NaN e infinito; objetos estritos recusam campo a mais.
  const cell = z.strictObject({ x: z.number(), text: z.string().max(limits.maxChars) });
  const line = z.strictObject({
    lineNumber: z.number().int().min(1).max(MAX_ROWS),
    page: z.number().int().min(1).max(limits.maxPages),
    cells: z.array(cell).max(limits.maxChars),
    text: z.string().max(limits.maxChars),
  });
  const text = z.strictObject({
    pageCount: z.number().int().min(1).max(limits.maxPages),
    lines: z.array(line).min(1).max(MAX_ROWS),
    charCount: z.number().int().min(0).max(limits.maxChars),
    activeContent: z.boolean(),
  });
  return z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), text }),
    z.strictObject({ ok: z.literal(false), code: z.enum(PDF_EXTRACT_ERROR_CODES) }),
  ]);
}

/**
 * Valida a mensagem da thread. Forma, tipos, tetos e coerência (numeração das
 * linhas, páginas dentro do documento, contagem de caracteres) são conferidos;
 * qualquer desvio vira `PDF_READER_FAILED`. Uma resposta de erro só pode
 * trazer um código conhecido.
 */
export function parsePdfWorkerReply(message: unknown, limits: ExtractLimits = {}): PdfText {
  const resolved = resolveLimits(limits);
  const parsed = replySchema(resolved).safeParse(message);
  if (!parsed.success) throw new PdfExtractError('PDF_READER_FAILED');
  if (!parsed.data.ok) throw new PdfExtractError(parsed.data.code);

  const text = parsed.data.text;
  let chars = 0;
  for (const [index, line] of text.lines.entries()) {
    if (line.lineNumber !== index + 1 || line.page > text.pageCount) throw new PdfExtractError('PDF_READER_FAILED');
    chars += line.text.length;
  }
  if (chars !== text.charCount) throw new PdfExtractError('PDF_READER_FAILED');
  return text;
}

/* ── Supervisão ─────────────────────────────────────────────────── */

let running = 0;
const waiting: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (running < MAX_PDF_WORKERS) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

export type PdfWorkerFactory = (options: WorkerOptions) => Worker;

/**
 * Roda a leitura numa thread criada por `create`, com prazo duro.
 *
 * Exportado para os testes trocarem a thread por uma que trava, estoura a
 * memória ou responde fora do formato. Quem lê PDF usa `extractPdfText`.
 */
export async function runPdfWorker(
  create: PdfWorkerFactory,
  bytes: Uint8Array,
  limits: ExtractLimits = {},
  hardTimeoutMs: number = PDF_WORKER_TIMEOUT_MS,
): Promise<PdfText> {
  await acquireSlot();
  return new Promise<PdfText>((resolve, reject) => {
    // Cópia própria: o buffer transferido fica inutilizável aqui, e quem chamou continua com os seus bytes.
    const buffer = bytes.slice().buffer;
    let worker: Worker;
    try {
      worker = create(pdfWorkerOptions(buffer, limits));
    } catch {
      releaseSlot();
      reject(new PdfExtractError('PDF_READER_FAILED'));
      return;
    }
    worker.stdout?.resume();
    worker.stderr?.resume();

    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      // Um erro tardio da thread já encerrada não pode derrubar o servidor.
      worker.on('error', () => undefined);
      // A vaga só é devolvida quando a thread acabou de fato e a memória dela foi liberada.
      worker
        .terminate()
        .catch(() => undefined)
        .finally(releaseSlot);
      settle();
    };

    const timer = setTimeout(() => finish(() => reject(new PdfExtractError('PDF_TIMEOUT'))), hardTimeoutMs);

    worker.once('message', (message: unknown) =>
      finish(() => {
        try {
          resolve(parsePdfWorkerReply(message, limits));
        } catch (error) {
          reject(error);
        }
      }),
    );
    worker.once('messageerror', () => finish(() => reject(new PdfExtractError('PDF_READER_FAILED'))));
    worker.once('error', (error: unknown) => {
      const outOfMemory = (error as { code?: unknown })?.code === 'ERR_WORKER_OUT_OF_MEMORY';
      finish(() => reject(new PdfExtractError(outOfMemory ? 'PDF_TOO_COMPLEX' : 'PDF_READER_FAILED')));
    });
    worker.once('exit', () => finish(() => reject(new PdfExtractError('PDF_READER_FAILED'))));
  });
}

/**
 * Extrai as linhas de texto de um PDF numa thread isolada, dentro dos tetos.
 *
 * O `new Worker(new URL(...))` fica literal aqui de propósito: é a forma que o
 * webpack do Next reconhece para empacotar a thread como arquivo próprio em
 * `next dev`, `next build` e no pacote standalone do Electron.
 */
export function extractPdfText(bytes: Uint8Array, limits: ExtractLimits = {}): Promise<PdfText> {
  if (!looksLikePdf(bytes)) return Promise.reject(new PdfExtractError('UNSUPPORTED_FORMAT'));
  return runPdfWorker((options) => new Worker(new URL('./extract-worker.ts', import.meta.url), options), bytes, limits);
}
