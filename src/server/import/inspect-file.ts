/* Ponto de entrada da inspeção para qualquer formato aceito.

   O formato é decidido pelo conteúdo: a assinatura `%PDF-` leva ao leitor de
   PDF; qualquer outra coisa segue para a inspeção de texto (CSV e OFX), que
   recusa binário. A leitura de PDF é assíncrona e fica fora de `inspect.ts`
   para que a inspeção de texto continue síncrona e pura. */

import { inspectStatement, type InspectOptions, type StatementInspection } from './inspect.ts';
import { looksLikePdf } from './pdf/extract.ts';
import { inspectPdfStatement } from './pdf/inspect.ts';

export async function inspectStatementFile(
  bytes: Uint8Array,
  options: InspectOptions = {},
): Promise<StatementInspection> {
  if (looksLikePdf(bytes)) return inspectPdfStatement(bytes);
  return inspectStatement(bytes, options);
}
