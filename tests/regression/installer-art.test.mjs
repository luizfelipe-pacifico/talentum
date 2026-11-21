import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

/* Telas de instalação com a marca (docs/DESIGN-SYSTEM.md, "Installer screens").

   O NSIS só aceita BMP de 24 bits nos tamanhos do Modern UI; uma imagem em outro
   formato ou tamanho quebra o build do Windows ou sai distorcida. O fundo do DMG
   precisa da versão @2x para telas Retina, e a faixa sob os ícones precisa deixar
   legível o nome que o Finder escreve em preto (tema claro) ou branco (escuro). */

const root = new URL('../../', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

async function bmp(path) {
  const file = await readFile(new URL(path, root));
  return { magic: file.toString('latin1', 0, 2), width: file.readInt32LE(18), height: file.readInt32LE(22), bits: file.readUInt16LE(28) };
}

async function png(path) {
  const file = await readFile(new URL(path, root));
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('o instalador do Windows usa as imagens da marca no tamanho do Modern UI', async () => {
  assert.equal(pkg.build.nsis.installerSidebar, 'packaging/instalador/nsis-lateral.bmp');
  assert.equal(pkg.build.nsis.uninstallerSidebar, 'packaging/instalador/nsis-lateral.bmp');
  assert.equal(pkg.build.nsis.installerHeader, 'packaging/instalador/nsis-cabecalho.bmp');
  assert.deepEqual(await bmp(pkg.build.nsis.installerSidebar), { magic: 'BM', width: 164, height: 314, bits: 24 });
  assert.deepEqual(await bmp(pkg.build.nsis.installerHeader), { magic: 'BM', width: 150, height: 57, bits: 24 });
  assert.equal(pkg.build.nsis.language, '1046', 'instalador em português do Brasil');
  assert.deepEqual(pkg.build.nsis.installerLanguages, ['pt_BR']);
  for (const icon of [pkg.build.nsis.installerIcon, pkg.build.nsis.uninstallerIcon]) assert.ok(existsSync(new URL(icon, root)), icon);
});

test('a janela do DMG tem fundo com versão Retina e ícones sobre a faixa', async () => {
  const { background, window, contents } = pkg.build.dmg;
  assert.deepEqual(await png(background), { width: window.width, height: window.height });
  assert.deepEqual(await png(background.replace(/\.png$/, '@2x.png')), { width: window.width * 2, height: window.height * 2 });
  assert.deepEqual(
    contents.map(({ x, y, type }) => ({ x, y, type })),
    [
      { x: 140, y: 232, type: 'file' },
      { x: 400, y: 232, type: 'link' },
    ],
    'as posições acompanham a seta desenhada em scripts/gerar-instalador.mjs',
  );
});

test('o nome dos ícones fica legível no Finder claro e no escuro', async () => {
  const script = await readFile(new URL('scripts/gerar-instalador.mjs', root), 'utf8');
  const band = script.match(/const FAIXA_DMG = '(#[0-9A-Fa-f]{6})'/)?.[1];
  assert.ok(band, 'cor da faixa declarada no gerador');
  const level = luminance(band);
  assert.ok((level + 0.05) / 0.05 >= 4.5, 'texto preto sobre a faixa abaixo de 4,5:1');
  assert.ok(1.05 / (level + 0.05) >= 4.5, 'texto branco sobre a faixa abaixo de 4,5:1');
});
