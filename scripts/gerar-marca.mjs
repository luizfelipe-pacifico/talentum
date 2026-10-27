/* Gera a marca do Talentum em vetor e os ícones .ico derivados dela.

   As marcas antigas eram PNGs em base64 dentro de um invólucro SVG. Aqui a
   geometria é desenhada uma vez, em coordenadas de 620 × 545, e vira:

   - icon-talentum-light.svg e icon-talentum-dark.svg na raiz;
   - public/marca e apps/web/public/marca, servidos pelo app e pela LP;
   - icon-badge.svg, o selo arredondado da janela e do favicon;
   - icon-badge.ico, src/app/favicon.ico e apps/web/src/app/favicon.ico,
     com 16, 24, 32, 48, 64, 128 e 256 px.

   Uso: node scripts/gerar-marca.mjs. A rasterização do .ico usa o sharp já
   instalado como dependência do Next. */

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const AMBAR = '#B8773D';
const EBANO = '#1A110A';
const ALABASTRO = '#F4F1EA';

/* Seta âmbar: faixa a 45° que nasce no mastro e termina numa ponta em ângulo
   reto no canto superior direito. O vão entre a seta e o resto da marca é
   recortado pela máscara, sem depender da cor do fundo. */
const SETA = 'M292 211 L464 38 L432 6 L528 6 L528 102 L496 70 L292 273 Z';

/* Tudo o que não é a seta: T com serifa em gancho, travessão, argolas,
   cordas e pratos da balança. */
const ESTRUTURA = [
  // Barra superior do T com o gancho da serifa à esquerda.
  'M95 15 H500 V60 H178 C148 60 132 76 132 106 H95 Z',
  // Mastro e base.
  'M290 15 H336 V492 H290 Z',
  'M190 490 H432 V535 H190 Z',
  // Travessão da balança.
  'M100 160 H522 V184 H100 Z',
  // Argolas: meia-lua com furo, uma em cada ponta do travessão.
  'M55 146 H140 A42.5 42.5 0 0 1 55 146 Z',
  'M479 146 H564 A42.5 42.5 0 0 1 479 146 Z',
  // Pratos.
  'M8 372 H188 A90 54 0 0 1 8 372 Z',
  'M432 372 H612 A90 54 0 0 1 432 372 Z',
].join(' ');

/* Cordas e fio central dos pratos, desenhados como traço. */
const CORDAS = 'M97 196 L22 372 M97 196 L174 372 M97 196 V372 M522 196 L446 372 M522 196 L598 372 M522 196 V372';

function marca({ tinta, titulo }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 545" role="img" aria-labelledby="titulo">
  <title id="titulo">${titulo}</title>
  <defs>
    <mask id="vao" maskUnits="userSpaceOnUse" x="0" y="0" width="620" height="545">
      <rect width="620" height="545" fill="#fff"/>
      <path d="${SETA}" fill="#000" stroke="#000" stroke-width="22" stroke-linejoin="miter"/>
      <circle cx="97.5" cy="160" r="15" fill="#000"/>
      <circle cx="521.5" cy="160" r="15" fill="#000"/>
    </mask>
  </defs>
  <g mask="url(#vao)" fill="${tinta}">
    <path d="${ESTRUTURA}"/>
    <path d="${CORDAS}" fill="none" stroke="${tinta}" stroke-width="11" stroke-linecap="round"/>
  </g>
  <path d="${SETA}" fill="${AMBAR}"/>
</svg>
`;
}

/* Selo: fundo ébano arredondado com a marca clara centralizada. */
function selo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="titulo">
  <title id="titulo">Selo do Talentum</title>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="${EBANO}"/>
  <g transform="translate(212 254) scale(0.968)">
${marca({ tinta: ALABASTRO, titulo: 'Talentum' })
  .replace(/^<svg[^>]*>\n/, '')
  .replace(/<\/svg>\n$/, '')
  .replace(/ id="titulo"|<title[^<]*<\/title>\n/g, '')
  .replace(/id="vao"/, 'id="vao-selo"')
  .replace(/url\(#vao\)/, 'url(#vao-selo)')}  </g>
</svg>
`;
}

const clara = marca({ tinta: EBANO, titulo: 'Talentum: balança atravessada por uma seta âmbar ascendente' });
const escura = marca({ tinta: ALABASTRO, titulo: 'Talentum: balança atravessada por uma seta âmbar ascendente' });

const escrever = (caminho, conteudo) => {
  const destino = join(raiz, caminho);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo);
  console.log(`${caminho} — ${Buffer.byteLength(conteudo)} bytes`);
};

escrever('icon-talentum-light.svg', clara);
escrever('icon-talentum-dark.svg', escura);
escrever('icon-badge.svg', selo());
for (const base of ['public/marca', 'apps/web/public/marca']) {
  escrever(`${base}/talentum-clara.svg`, clara);
  escrever(`${base}/talentum-escura.svg`, escura);
}

/* .ico com entradas PNG (aceito por Windows Vista em diante e pelos navegadores). */
const sharp = createRequire(createRequire(import.meta.url).resolve('next/package.json'))('sharp');
const tamanhos = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(
  tamanhos.map((tamanho) => sharp(Buffer.from(selo()), { density: 384 }).resize(tamanho, tamanho).png().toBuffer()),
);

const cabecalho = Buffer.alloc(6 + tamanhos.length * 16);
cabecalho.writeUInt16LE(0, 0);
cabecalho.writeUInt16LE(1, 2);
cabecalho.writeUInt16LE(tamanhos.length, 4);
let deslocamento = cabecalho.length;
tamanhos.forEach((tamanho, i) => {
  const entrada = 6 + i * 16;
  cabecalho[entrada] = tamanho === 256 ? 0 : tamanho;
  cabecalho[entrada + 1] = tamanho === 256 ? 0 : tamanho;
  cabecalho.writeUInt16LE(1, entrada + 4);
  cabecalho.writeUInt16LE(32, entrada + 6);
  cabecalho.writeUInt32LE(pngs[i].length, entrada + 8);
  cabecalho.writeUInt32LE(deslocamento, entrada + 12);
  deslocamento += pngs[i].length;
});
const ico = Buffer.concat([cabecalho, ...pngs]);
for (const caminho of ['icon-badge.ico', 'src/app/favicon.ico', 'apps/web/src/app/favicon.ico']) {
  writeFileSync(join(raiz, caminho), ico);
  console.log(`${caminho} — ${ico.length} bytes`);
}
