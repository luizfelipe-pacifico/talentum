import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* As marcas eram PNGs em base64 dentro de um invólucro SVG (até 635 KB, sem
   nenhum vetor). Agora são desenhadas em SVG de verdade, e o .ico é gerado
   a partir delas. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const VECTORS = [
  'icon-talentum-light.svg',
  'icon-talentum-dark.svg',
  'icon-badge.svg',
  'public/marca/talentum-clara.svg',
  'public/marca/talentum-escura.svg',
  'apps/web/public/marca/talentum-clara.svg',
  'apps/web/public/marca/talentum-escura.svg',
];

test('as marcas são vetores, não bitmap embutido', async () => {
  for (const path of VECTORS) {
    const svg = await read(path);
    assert.doesNotMatch(svg, /<image|base64/, path);
    assert.match(svg, /<path /, path);
    assert.ok(Buffer.byteLength(svg) < 8_000, `${path} deveria ser leve: ${Buffer.byteLength(svg)} bytes`);
    assert.match(svg, /fill="#b8773d"/i, `${path} mantém o âmbar da marca`);
  }
});

test('os .ico trazem as resoluções de janela, barra de tarefas e favicon', async () => {
  for (const path of ['icon-badge.ico', 'apps/web/src/app/favicon.ico', 'src/app/favicon.ico']) {
    const ico = await readFile(new URL(path, root));
    assert.equal(ico.readUInt16LE(0), 0, path);
    assert.equal(ico.readUInt16LE(2), 1, `${path} é ícone`);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256);
    for (const size of [16, 32, 48, 256]) assert.ok(sizes.includes(size), `${path} sem ${size}px`);
  }
});

test('as telas usam as marcas vetoriais, não os WebP antigos', async () => {
  for (const path of ['src/app/layout.tsx', 'apps/web/src/app/layout.tsx', 'apps/web/src/components/lp/landing-page.tsx'])
    assert.doesNotMatch(await read(path), /marca\/talentum-(clara|escura)-\d+\.webp/, path);
});
