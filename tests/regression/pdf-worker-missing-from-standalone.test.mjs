import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

/* Defeito (primeiro teste do AppImage, 20/11/2026): no app empacotado toda
   importação de PDF terminava em "a leitura parou antes do fim"
   (PDF_READER_FAILED). O rastreamento de arquivos do Next copia para
   `.next/standalone` só o que é exigido por `require`; a thread de leitura é
   carregada por `new Worker(new URL(...))`, então o chunk dela ficava em
   `.next/server/chunks/` e nunca chegava ao standalone. `next dev` e
   `next start` funcionavam porque leem `.next/server` direto. A imagem Docker,
   que também copia só o standalone, tinha a mesma falha.

   O mesmo valia para `pdfjs-dist`, pacote externo ao bundle que só a thread
   importa: fora do repositório (no pacote) ele não existia. Dentro do
   repositório o standalone o achava subindo até o node_modules da raiz, por
   isso o teste com o servidor standalone local passava.

   Correção: o preparo do desktop e o Dockerfile copiam `.next/server/chunks`
   para o standalone, como já fazem com `.next/static`. Quando há pacote
   construído, o teste confere que o chunk da thread está nele. */

const root = new URL('../../', import.meta.url);

test('o preparo do desktop copia os chunks do servidor para o standalone', async () => {
  const prepare = await readFile(new URL('scripts/desktop-prepare.mjs', root), 'utf8');
  assert.match(prepare, /cp\('\.next\/server\/chunks', '\.next\/standalone\/\.next\/server\/chunks'/);
});

test('o preparo do desktop leva o pdfjs-dist resolvido para o standalone', async () => {
  const prepare = await readFile(new URL('scripts/desktop-prepare.mjs', root), 'utf8');
  assert.match(prepare, /cp\(realpathSync\('node_modules\/pdfjs-dist'\), '\.next\/standalone\/node_modules\/pdfjs-dist'/);
});

test('a imagem Docker leva os chunks do servidor', async () => {
  const docker = await readFile(new URL('Dockerfile', root), 'utf8');
  assert.match(docker, /COPY --from=builder [^\n]*\/app\/\.next\/server\/chunks \.\/\.next\/server\/chunks/);
});

const packagedChunks = new URL('release/linux-unpacked/resources/standalone/.next/server/chunks/', root);
test('o pacote construído tem o chunk da thread de PDF', { skip: !existsSync(packagedChunks) && 'nenhum pacote construído' }, () => {
  const withWorker = readdirSync(packagedChunks).filter((name) => name.endsWith('.js') && readFileSync(new URL(name, packagedChunks), 'utf8').includes('parentPort'));
  assert.ok(withWorker.length > 0, 'nenhum chunk com a thread de leitura');
  assert.ok(existsSync(new URL('../../../node_modules/pdfjs-dist/legacy/build/pdf.mjs', packagedChunks)), 'pdfjs-dist');
  assert.ok(existsSync(new URL('../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', packagedChunks)), 'pdf.worker');
});
