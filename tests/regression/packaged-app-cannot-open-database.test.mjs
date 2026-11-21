import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

/* Defeito (primeiro teste de um pacote real, AppImage Linux, 20/11/2026): o app
   empacotado abria em "Não foi possível verificar o bloqueio" e nunca saía
   dali. Toda rota que usa o banco respondia 500 com "Cannot find module
   '.prisma/client/default'": o electron-builder descarta qualquer pasta
   `node_modules` dentro de `files`, então o `.next/standalone/node_modules`
   (cliente Prisma gerado e dependências rastreadas pelo Next) ficava de fora e
   o servidor resolvia para o `node_modules` de produção, que não tem o cliente.

   No mesmo pacote, o rastreamento de arquivos do Next tinha copiado
   `.claude/worktrees/` (cópias de trabalho de agentes) para o standalone.

   Correção: o standalone entra por `extraResources`, com uma segunda entrada
   cuja raiz é o próprio `node_modules` (o filtro descarta a pasta em qualquer
   outra posição), o processo principal o procura lá, e o Next exclui
   do rastreamento as pastas que não são do app. Quando há pacote construído em
   release/linux-unpacked, o teste confere o próprio pacote. */

const root = new URL('../../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('o standalone vai inteiro para o pacote, com node_modules', () => {
  const resources = pkg.build.extraResources ?? [];
  const standalone = resources.find((entry) => entry.from === '.next/standalone');
  assert.ok(standalone, 'extraResources sem .next/standalone');
  assert.equal(standalone.to, 'standalone');
  // O filtro do electron-builder descarta pastas node_modules mesmo em
  // extraResources; só uma entrada cuja raiz é a própria pasta as copia.
  const modules = resources.find((entry) => entry.from === '.next/standalone/node_modules');
  assert.equal(modules?.to, 'standalone/node_modules');
  assert.ok(!pkg.build.files.includes('.next/standalone/**/*'), 'o standalone não deve mais passar pelo filtro de files');
});

test('o processo principal inicia o servidor a partir dos recursos', async () => {
  const main = await readFile(new URL('electron/main.cjs', root), 'utf8');
  assert.match(main, /path\.join\(process\.resourcesPath, 'standalone'\)/);
});

test('o rastreamento do Next ignora pastas que não são do app', async () => {
  const config = await readFile(new URL('next.config.ts', root), 'utf8');
  assert.match(config, /outputFileTracingExcludes/);
  for (const folder of ['.claude', 'release', 'temp']) assert.ok(config.includes(`'${folder}/**'`), folder);
});

const packaged = new URL('release/linux-unpacked/resources/standalone/', root);
test('o pacote construído tem o cliente Prisma e não tem .claude', { skip: !existsSync(packaged) && 'nenhum pacote construído' }, () => {
  assert.ok(existsSync(new URL('node_modules/@prisma/client/default.js', packaged)), '@prisma/client');
  assert.ok(existsSync(new URL('node_modules/next/package.json', packaged)), 'next');
  assert.ok(!existsSync(new URL('.claude', packaged)));
  assert.ok(!existsSync(new URL('release/linux-unpacked/resources/app/.next/standalone', root)), 'cópia antiga dentro de app/');
});
