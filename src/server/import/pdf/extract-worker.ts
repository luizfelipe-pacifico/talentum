/* Thread isolada que lê o PDF.

   Recebe só os bytes do arquivo (o `ArrayBuffer` é transferido, não copiado)
   e os tetos numéricos. Não recebe chave do cofre, conexão com o banco, sessão
   nem variáveis de ambiente: `extract.ts` cria esta thread com `env: {}` e
   `workerData` contendo apenas `{ bytes, limits }`. Devolve uma única mensagem,
   que o servidor valida antes de usar, e termina. */

import { parentPort, workerData } from 'node:worker_threads';
import { type ExtractLimits, PdfExtractError } from './document.ts';
import { readPdfText } from './read-pdf.ts';

type Input = { bytes: ArrayBuffer; limits: ExtractLimits };

async function main(): Promise<void> {
  const port = parentPort;
  if (!port) return;
  const input = workerData as Input;
  try {
    const text = await readPdfText(new Uint8Array(input.bytes), input.limits);
    port.postMessage({ ok: true, text });
  } catch (error) {
    // Só o código estável atravessa a fronteira: nada de mensagem, pilha ou trecho do documento.
    port.postMessage({ ok: false, code: error instanceof PdfExtractError ? error.code : 'UNSUPPORTED_FORMAT' });
  }
}

void main();
