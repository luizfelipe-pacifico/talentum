import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Com a importação de PDF pronta (etapa 7), o estado vazio de Extratos, o
   diálogo de importação rápida e o guia de layout ainda diziam "CSV ou OFX",
   embora o assistente aceite PDF. A mensagem de tempo esgotado do leitor de
   CSV e OFX fica de fora: o PDF tem o seu próprio erro (PDF_TIMEOUT). */

const root = new URL('../../', import.meta.url);
const arquivos = ['src/components/statements.tsx', 'src/components/overlays.tsx', 'src/components/layout-guide.tsx'];

test('as telas que listam formatos de importação incluem o PDF', async () => {
  for (const arquivo of arquivos) {
    const fonte = await readFile(new URL(arquivo, root), 'utf8');
    for (const [trecho] of fonte.matchAll(/[^.>\n]*\b(CSV ou OFX|OFX ou CSV|CSV e OFX|OFX e CSV)\b[^.<\n]*/g)) {
      assert.match(trecho, /PDF/, `${arquivo}: "${trecho.trim()}"`);
    }
  }
});
