import test from 'node:test'; import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url); const read=(path)=>readFile(new URL(path,root),'utf8');

/* Invariantes dos scripts de desenvolvimento. São regras que não podem regredir
   em silêncio: a primeira é de segurança, as outras protegem o ambiente de quem
   já está com um servidor no ar. */

test('o servidor de desenvolvimento escuta somente no loopback',async()=>{
  const source=await read('scripts/dev.mjs');
  // docs/HOW-IT-WORKS.md: a API local não deve ficar exposta para a rede externa.
  assert.match(source,/'-H',\s*'127\.0\.0\.1'/);
  assert.doesNotMatch(source,/0\.0\.0\.0|'-H',\s*'::'/);
});

test('a janela do Electron abre localhost, com IPv4 como segunda tentativa',async()=>{
  const devAll=await read('scripts/dev-all.mjs');
  assert.match(devAll,/`http:\/\/localhost:\$\{port\}`,\s*`http:\/\/127\.0\.0\.1:\$\{port\}`/);
  assert.match(await read('electron/main.cjs'),/TALENTUM_URL \|\| 'http:\/\/localhost:3000'/);
});

test('só o healthcheck do próprio Talentum autoriza anexar a janela',async()=>{
  const source=await read('scripts/dev-all.mjs');
  assert.match(source,/\/api\/health\/live/);
  assert.match(source,/statusCode === 200 && body\.includes\('"status":"ok"'\)/);
});

test('dev:all nunca encerra um servidor que não iniciou',async()=>{
  const source=await read('scripts/dev-all.mjs');
  // `nextProcess` permanece null no modo anexado; todo encerramento passa por
  // `stopNext`, que é um no-op nesse caso. Um kill direto mataria o container.
  assert.match(source,/let nextProcess = null/);
  assert.match(source,/const stopNext = \(signal = 'SIGTERM'\) => nextProcess\?\.kill\(signal\)/);
  assert.doesNotMatch(source,/(?<!\?\.)\bnextProcess\.kill\(/);
});
