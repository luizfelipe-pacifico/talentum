/* Limites do importador.

   `docs/SECURITY.md` trata arquivo enviado como entrada hostil: exige limite de
   tamanho, detecção real de tipo, parser isolado e timeout. Os números ficam
   aqui, em um só lugar, para que rota, parser e teste usem o mesmo valor. */

/** Teto de bytes aceito no upload. Um extrato mensal fica na casa dos KB. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

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
