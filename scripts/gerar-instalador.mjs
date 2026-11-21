/* Gera as imagens das telas de instalação (docs/DESIGN-SYSTEM.md, "Installer screens").

   - packaging/instalador/nsis-lateral.bmp (164 × 314): faixa das telas de boas-vindas
     e de conclusão do instalador do Windows, e a mesma para o desinstalador;
   - packaging/instalador/nsis-cabecalho.bmp (150 × 57): cabeçalho das telas internas;
   - packaging/instalador/dmg-fundo.png e dmg-fundo@2x.png (540 × 380): janela do
     disco do macOS, com a seta de arrastar para Aplicativos.

   As cenas são HTML com as fontes da marca, fotografadas pelo Chromium do
   Playwright (já usado nos testes). O NSIS só aceita BMP de 24 bits, escrito
   aqui a partir dos pixels.

   Uso: pnpm instalador:gerar. As imagens geradas são versionadas. */

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const saida = join(raiz, 'packaging', 'instalador');
const sharp = createRequire(createRequire(import.meta.url).resolve('next/package.json'))('sharp');

const AMBAR = '#B8773D';
const EBANO = '#1A110A';
const ALABASTRO = '#F4F1EA';
/* Faixa sob os ícones do DMG. O Finder escreve os nomes em preto no tema claro e
   em branco no escuro, sem olhar o fundo: com luminância perto de 0,18 os dois
   ficam acima de 4,5:1 (conferido em tests/regression/installer-art.test.mjs). */
const FAIXA_DMG = '#A16938';

const fonte = (arquivo) => readFileSync(join(raiz, 'node_modules', '@fontsource', arquivo)).toString('base64');
const FONTES = `
@font-face { font-family: Playfair; font-weight: 600; src: url(data:font/woff2;base64,${fonte('playfair-display/files/playfair-display-latin-600-normal.woff2')}) format('woff2'); }
@font-face { font-family: Montserrat; font-weight: 500; src: url(data:font/woff2;base64,${fonte('montserrat/files/montserrat-latin-500-normal.woff2')}) format('woff2'); }
@font-face { font-family: Montserrat; font-weight: 600; src: url(data:font/woff2;base64,${fonte('montserrat/files/montserrat-latin-600-normal.woff2')}) format('woff2'); }
* { margin: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body { font-family: Montserrat, sans-serif; -webkit-font-smoothing: antialiased; }`;

// `talentum-clara` é a marca para fundo claro (traço ébano); `talentum-escura`, para fundo escuro.
const marcaFundoClaro = readFileSync(join(raiz, 'public', 'marca', 'talentum-clara.svg'), 'utf8');
const marcaFundoEscuro = readFileSync(join(raiz, 'public', 'marca', 'talentum-escura.svg'), 'utf8');
const embutir = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const LATERAL = `
<style>${FONTES}
body { background: ${EBANO}; color: ${ALABASTRO}; padding: 28px 18px 22px; display: flex; flex-direction: column; }
img { width: 58px; height: auto; }
.nome { font-family: Playfair; font-weight: 600; font-size: 25px; margin-top: 14px; letter-spacing: 0.2px; }
.traco { width: 28px; height: 2px; background: ${AMBAR}; margin: 14px 0 16px; }
.lema { font-size: 12px; line-height: 17px; font-weight: 500; text-wrap: balance; }
.lema span { color: ${AMBAR}; display: block; }
.rodape { margin-top: auto; font-size: 10px; line-height: 14px; text-wrap: pretty; color: rgb(244 241 234 / 72%); }
</style>
<img src="${embutir(marcaFundoEscuro)}" alt="">
<p class="nome">Talentum</p>
<div class="traco"></div>
<p class="lema">Clareza para o presente.<span>Disciplina para o futuro.</span></p>
<p class="rodape">Seus dados financeiros ficam neste computador, cifrados com a sua senha.</p>`;

const CABECALHO = `
<style>${FONTES}
body { background: #ffffff; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-right: 12px; color: ${EBANO}; }
img { width: 30px; height: auto; }
p { font-family: Playfair; font-weight: 600; font-size: 17px; }
</style>
<img src="${embutir(marcaFundoClaro)}" alt="">
<p>Talentum</p>`;

/* Ícones do DMG: app em (140, 232) e Aplicativos em (400, 232), no centro da
   faixa. As posições se repetem em build.dmg.contents no package.json. */
const DMG = `
<style>${FONTES}
body { background: ${ALABASTRO}; color: ${EBANO}; position: relative; overflow: hidden; }
.topo { position: absolute; top: 34px; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.marca { display: flex; align-items: center; gap: 8px; }
.marca img { width: 26px; height: auto; }
.marca p { font-family: Playfair; font-weight: 600; font-size: 19px; }
.instrucao { font-size: 13px; font-weight: 500; }
.faixa { position: absolute; left: 0; right: 0; top: 124px; bottom: 0; background: ${FAIXA_DMG}; }
.seta { position: absolute; left: 214px; top: 214px; width: 112px; height: 36px; }
</style>
<div class="topo">
  <div class="marca"><img src="${embutir(marcaFundoClaro)}" alt=""><p>Talentum</p></div>
  <p class="instrucao">Arraste o Talentum para a pasta Aplicativos</p>
</div>
<div class="faixa"></div>
<svg class="seta" viewBox="0 0 112 36" aria-hidden="true">
  <path d="M6 18 H94" stroke="${ALABASTRO}" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 10"/>
  <path d="M88 6 L104 18 L88 30" fill="none" stroke="${ALABASTRO}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** BMP de 24 bits, de baixo para cima, como o NSIS espera. */
function bmp24({ data, info }) {
  const { width, height, channels } = info;
  const linha = Math.ceil((width * 3) / 4) * 4;
  const arquivo = Buffer.alloc(54 + linha * height);
  arquivo.write('BM', 0, 'latin1');
  arquivo.writeUInt32LE(arquivo.length, 2);
  arquivo.writeUInt32LE(54, 10);
  arquivo.writeUInt32LE(40, 14);
  arquivo.writeInt32LE(width, 18);
  arquivo.writeInt32LE(height, 22);
  arquivo.writeUInt16LE(1, 26);
  arquivo.writeUInt16LE(24, 28);
  arquivo.writeUInt32LE(linha * height, 34);
  for (let y = 0; y < height; y += 1) {
    const destino = 54 + (height - 1 - y) * linha;
    for (let x = 0; x < width; x += 1) {
      const origem = (y * width + x) * channels;
      arquivo[destino + x * 3] = data[origem + 2];
      arquivo[destino + x * 3 + 1] = data[origem + 1];
      arquivo[destino + x * 3 + 2] = data[origem];
    }
  }
  return arquivo;
}

async function fotografar(pagina, html, width, height) {
  await pagina.setViewportSize({ width, height });
  await pagina.setContent(`<!doctype html><html lang="pt-BR"><body>${html}</body></html>`);
  await pagina.evaluate(() => document.fonts.ready);
  return pagina.screenshot({ type: 'png', omitBackground: false });
}

mkdirSync(saida, { recursive: true });
const navegador = await chromium.launch();
try {
  const simples = await navegador.newPage({ deviceScaleFactor: 1 });
  const lateral = await sharp(await fotografar(simples, LATERAL, 164, 314)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  writeFileSync(join(saida, 'nsis-lateral.bmp'), bmp24(lateral));
  const cabecalho = await sharp(await fotografar(simples, CABECALHO, 150, 57)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  writeFileSync(join(saida, 'nsis-cabecalho.bmp'), bmp24(cabecalho));
  writeFileSync(join(saida, 'dmg-fundo.png'), await fotografar(simples, DMG, 540, 380));
  const retina = await navegador.newPage({ deviceScaleFactor: 2 });
  writeFileSync(join(saida, 'dmg-fundo@2x.png'), await fotografar(retina, DMG, 540, 380));
} finally {
  await navegador.close();
}
console.log('Imagens do instalador geradas em packaging/instalador.');
