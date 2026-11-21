/* Limites do importador.

   `docs/SECURITY.md` trata arquivo enviado como entrada hostil: exige limite de
   tamanho, detecção real de tipo, parser isolado e timeout. Os números ficam
   aqui, em um só lugar, para que rota, parser e teste usem o mesmo valor. */

/** Teto de bytes aceito no upload. Um extrato mensal fica na casa dos KB. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Teto do corpo da requisição de upload, conferido pelo `Content-Length` antes
 * de qualquer leitura. O arquivo mais o envelope multipart (limites, nome,
 * mapeamento e dialeto em JSON) cabe com folga em 64 KiB além do arquivo.
 */
export const MAX_UPLOAD_BYTES = MAX_FILE_BYTES + 64 * 1024;

/** Teto de linhas processadas. Protege contra arquivo inflado de propósito. */
export const MAX_ROWS = 20_000;

/** Teto de colunas por linha. CSV legítimo de extrato não passa disso. */
export const MAX_COLUMNS = 64;

/** Teto de caracteres por campo, antes de truncar a descrição persistida. */
export const MAX_DESCRIPTION_CHARS = 300;

/** Teto de tempo de parsing, em milissegundos. */
export const PARSE_TIMEOUT_MS = 10_000;

/** Linhas devolvidas na prévia. A prévia é amostra, não o lote inteiro. */
export const PREVIEW_ROWS = 12;

/* ── PDF ─────────────────────────────────────────────────────────
   Um PDF é um programa de layout, não um texto: ele pode declarar milhares de
   páginas, streams comprimidos que inflam ao serem lidos e ações embutidas. Os
   tetos abaixo valem antes, durante e depois da extração (ADR 0006). */

/** Teto de páginas lidas. Uma fatura ou extrato mensal tem poucas páginas. */
export const MAX_PDF_PAGES = 40;

/** Teto de caracteres extraídos do documento inteiro. */
export const MAX_PDF_CHARS = 400_000;

/** Teto de tempo da extração de texto do PDF, em milissegundos. */
export const PDF_PARSE_TIMEOUT_MS = 8_000;

/**
 * Prazo duro do worker que lê o PDF, em milissegundos.
 *
 * O prazo cooperativo acima vale dentro do worker; este é medido pelo servidor
 * e encerra a thread com `terminate()` mesmo no meio de um passo síncrono. A
 * folga sobre o prazo cooperativo cobre a partida da thread e o carregamento
 * do pdf.js.
 */
export const PDF_WORKER_TIMEOUT_MS = 12_000;

/** Teto do heap do worker do PDF, em MiB. Estourar encerra só a thread. */
export const PDF_WORKER_MAX_OLD_GENERATION_MB = 256;

/** Teto da geração jovem do heap do worker do PDF, em MiB. */
export const PDF_WORKER_MAX_YOUNG_GENERATION_MB = 32;

/** Teto da pilha do worker do PDF, em MiB. */
export const PDF_WORKER_STACK_MB = 4;

/**
 * Workers de PDF ao mesmo tempo. Os demais esperam a vez, para que envios
 * simultâneos não somem vários tetos de memória.
 */
export const MAX_PDF_WORKERS = 2;

/**
 * Confiança mínima para um lançamento lido de PDF entrar no lote.
 *
 * Abaixo dela a linha vira problema declarado (`LOW_CONFIDENCE`) em vez de
 * lançamento: um débito lido como crédito corromperia o saldo sem aviso.
 */
export const PDF_MIN_CONFIDENCE = 0.7;
