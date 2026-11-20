/* Leitura do upload de extrato.

   `docs/SECURITY.md` trata arquivo enviado como entrada hostil. O que é checado
   aqui, antes de qualquer parsing:

   - o campo existe e é mesmo um arquivo;
   - o tamanho cabe no teto, medido antes de ler os bytes para a memória;
   - o nome original é tratado como rótulo, nunca como caminho.

   Extensão e `Content-Type` declarados não decidem nada: o formato é
   reconhecido pelo conteúdo, em `inspectStatement`. */

import { z } from 'zod';
import type { ColumnRole, CsvDialect, CsvMapping } from './csv.ts';
import { MAX_FILE_BYTES, MAX_UPLOAD_BYTES } from './limits.ts';

export type UploadErrorCode = 'FILE_MISSING' | 'FILE_TOO_LARGE' | 'LENGTH_REQUIRED' | 'INVALID_MAPPING' | 'INVALID_DIALECT';

export class UploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode) {
    super(code);
    this.name = 'UploadError';
    this.code = code;
  }
}

const ROLES: readonly ColumnRole[] = [
  'date',
  'description',
  'amount',
  'debitAmount',
  'creditAmount',
  'direction',
  'externalId',
  'balance',
  'document',
  'ignore',
];

const mappingSchema = z.object({
  roles: z.array(z.enum(ROLES as [ColumnRole, ...ColumnRole[]])).min(1).max(64),
});

const dialectSchema = z.object({
  separator: z.enum([';', ',', '\t', '|']).optional(),
  hasHeader: z.boolean().optional(),
  decimalSeparator: z.enum(['auto', ',', '.']).optional(),
});

export type StatementUpload = {
  bytes: Uint8Array;
  originalName: string;
  mediaType: string;
  byteSize: number;
  mapping?: CsvMapping;
  dialect?: Partial<CsvDialect>;
  /** Conta de destino, presente apenas na gravação do lote. */
  accountId: string | null;
  /** Pedido explícito para guardar o mapeamento de colunas conferido. */
  rememberMapping: boolean;
};

/**
 * Lê o multipart do upload e devolve os bytes com os ajustes confirmados.
 *
 * O corpo da requisição só pode ser consumido uma vez, então todos os campos —
 * arquivo, mapeamento, dialeto e conta — saem desta única leitura.
 */
export async function readStatementUpload(request: Request): Promise<StatementUpload> {
  // O tamanho declarado decide antes de qualquer byte ser lido: `formData()`
  // bufferiza o corpo inteiro, e o teto do arquivo sozinho chegaria tarde.
  const declared = request.headers.get('content-length');
  if (declared === null || !/^\d{1,15}$/.test(declared)) throw new UploadError('LENGTH_REQUIRED');
  if (Number(declared) > MAX_UPLOAD_BYTES) throw new UploadError('FILE_TOO_LARGE');

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) throw new UploadError('FILE_MISSING');
  // Medido antes de materializar os bytes.
  if (file.size > MAX_FILE_BYTES) throw new UploadError('FILE_TOO_LARGE');
  if (file.size === 0) throw new UploadError('FILE_MISSING');

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_FILE_BYTES) throw new UploadError('FILE_TOO_LARGE');

  let mapping: CsvMapping | undefined;
  const mappingRaw = form.get('mapping');
  if (typeof mappingRaw === 'string' && mappingRaw.length > 0) {
    let candidate: unknown;
    try {
      candidate = JSON.parse(mappingRaw);
    } catch {
      throw new UploadError('INVALID_MAPPING');
    }
    const parsed = mappingSchema.safeParse(candidate);
    if (!parsed.success) throw new UploadError('INVALID_MAPPING');
    mapping = parsed.data;
  }

  let dialect: Partial<CsvDialect> | undefined;
  const dialectRaw = form.get('dialect');
  if (typeof dialectRaw === 'string' && dialectRaw.length > 0) {
    let candidate: unknown;
    try {
      candidate = JSON.parse(dialectRaw);
    } catch {
      throw new UploadError('INVALID_DIALECT');
    }
    const parsed = dialectSchema.safeParse(candidate);
    if (!parsed.success) throw new UploadError('INVALID_DIALECT');
    dialect = parsed.data;
  }

  const accountRaw = form.get('accountId');
  const accountId =
    typeof accountRaw === 'string' && accountRaw.trim().length > 0 && accountRaw.trim().length <= 64
      ? accountRaw.trim()
      : null;

  // Guardar o mapeamento é escolha explícita: um layout salvo sem consentimento
  // seria reaplicado em silêncio na importação seguinte.
  const rememberMapping = form.get('rememberMapping') === 'true';

  return {
    bytes,
    originalName: file.name || 'extrato',
    mediaType: file.type || 'application/octet-stream',
    byteSize: bytes.byteLength,
    mapping,
    dialect,
    accountId,
    rememberMapping,
  };
}

/** Mensagens públicas dos erros do importador, sem detalhe interno. */
export const IMPORT_ERROR_MESSAGES: Record<string, string> = {
  FILE_MISSING: 'Nenhum arquivo foi recebido.',
  FILE_TOO_LARGE: 'O arquivo excede o tamanho máximo aceito.',
  LENGTH_REQUIRED: 'O envio não informou o tamanho do arquivo.',
  PARSE_TIMEOUT: 'A leitura do arquivo demorou além do limite. Confira se é um extrato em CSV ou OFX.',
  EMPTY_FILE: 'O arquivo está vazio.',
  BINARY_CONTENT: 'O arquivo não é um extrato em texto.',
  UNREADABLE_ENCODING: 'A codificação do arquivo não pôde ser interpretada.',
  UNSUPPORTED_FORMAT: 'O formato do arquivo não é compatível.',
  NO_ROWS: 'O arquivo não contém linhas de lançamento.',
  TOO_MANY_ROWS: 'O arquivo excede o número máximo de linhas aceito.',
  NO_USABLE_ROWS: 'Nenhuma linha do arquivo pôde ser interpretada como lançamento.',
  MAPPING_INCOMPLETE: 'É preciso indicar ao menos a coluna de data e a de valor.',
  INVALID_MAPPING: 'O mapeamento de colunas é inválido.',
  INVALID_DIALECT: 'O dialeto informado é inválido.',
  DUPLICATE_BATCH: 'Este extrato já foi importado.',
  ACCOUNT_NOT_FOUND: 'A conta informada não existe.',
  NOTHING_TO_IMPORT: 'Não há lançamentos para importar.',
  PDF_ENCRYPTED: 'O PDF está protegido por senha. Exporte uma cópia sem senha no site ou aplicativo do banco.',
  TOO_MANY_PAGES: 'O PDF tem mais páginas do que o importador aceita.',
  PDF_TOO_MUCH_TEXT: 'O PDF tem mais texto do que o importador aceita.',
  PDF_TIMEOUT: 'A leitura do PDF passou do tempo limite e foi interrompida.',
};

/** Códigos que representam erro da pessoa, e não falha do servidor. */
export const CLIENT_ERROR_STATUS: Record<string, number> = {
  DUPLICATE_BATCH: 409,
  ACCOUNT_NOT_FOUND: 404,
  FILE_TOO_LARGE: 413,
  LENGTH_REQUIRED: 411,
  TOO_MANY_ROWS: 413,
  TOO_MANY_PAGES: 413,
  PDF_TOO_MUCH_TEXT: 413,
  PDF_ENCRYPTED: 422,
  PDF_TIMEOUT: 422,
  PARSE_TIMEOUT: 422,
};
