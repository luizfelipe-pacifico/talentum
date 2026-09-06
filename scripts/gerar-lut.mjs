/* Gera o LUT padrão de imagem do Talentum.

   O grau é o mesmo do filtro CSS .lp-lut e do filtro SVG #lut-talentum:
   dessatura levemente, aquece os meios-tons na direção do âmbar clássico,
   assenta as sombras no ébano e aplica um contraste discreto em S.

   Saída: arquivo .cube 17³, aceito por Photoshop, Lightroom, Affinity,
   DaVinci Resolve, Figma (plugins) e ffmpeg.

   Uso: node scripts/gerar-lut.mjs */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destinos = [join(raiz, 'public', 'lut'), join(raiz, 'apps', 'web', 'public', 'lut')];

const TAMANHO = 17;

// Referências da marca, normalizadas.
const EBANO = [0x1a / 255, 0x11 / 255, 0x0a / 255];
const AMBAR = [0xb8 / 255, 0x77 / 255, 0x3d / 255];

const clamp = (valor) => Math.min(1, Math.max(0, valor));
const mix = (a, b, peso) => a + (b - a) * peso;

function transformar(entrada) {
  let [r, g, b] = entrada;

  // 1. Dessaturação leve em direção à luminância percebida.
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = mix(r, luma, 0.12);
  g = mix(g, luma, 0.12);
  b = mix(b, luma, 0.12);

  // 2. Curva por canal: vermelho ganha, azul cede. É o calor do papel velho.
  r = Math.pow(r, 0.94);
  g = Math.pow(g, 0.98);
  b = Math.pow(b, 1.06);

  // 3. Altas-luzes puxadas para o âmbar, discretamente.
  const alta = Math.pow(luma, 2.4) * 0.07;
  r = mix(r, AMBAR[0], alta * 0.5);
  g = mix(g, AMBAR[1], alta * 0.35);
  b = mix(b, AMBAR[2], alta * 0.2);

  // 4. Contraste em S: firma o meio-tom sem estourar as pontas.
  const contraste = (canal) => {
    const centrado = canal - 0.5;
    return clamp(0.5 + centrado * 1.06 + centrado * (0.25 - centrado * centrado) * 0.22);
  };

  r = contraste(r);
  g = contraste(g);
  b = contraste(b);

  // 5. Sombras assentadas no ébano por último, para o preto nunca ser absoluto.
  const sombra = Math.pow(1 - luma, 2.2) * 0.085;
  return [mix(r, EBANO[0], sombra), mix(g, EBANO[1], sombra), mix(b, EBANO[2], sombra)];
}

const linhas = [
  '# Talentum · Arquivo — LUT padrão de imagem do projeto',
  '# Gerado por scripts/gerar-lut.mjs. Não editar à mão.',
  '# Equivalentes na web: classe .lp-lut e filtro SVG #lut-talentum.',
  'TITLE "Talentum Arquivo"',
  `LUT_3D_SIZE ${TAMANHO}`,
  'DOMAIN_MIN 0.0 0.0 0.0',
  'DOMAIN_MAX 1.0 1.0 1.0',
  '',
];

// No formato .cube o canal vermelho varia mais rápido, depois verde, depois azul.
for (let ib = 0; ib < TAMANHO; ib += 1) {
  for (let ig = 0; ig < TAMANHO; ig += 1) {
    for (let ir = 0; ir < TAMANHO; ir += 1) {
      const saida = transformar([ir / (TAMANHO - 1), ig / (TAMANHO - 1), ib / (TAMANHO - 1)]);
      linhas.push(saida.map((canal) => canal.toFixed(6)).join(' '));
    }
  }
}

const conteudo = `${linhas.join('\n')}\n`;

for (const destino of destinos) {
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, 'talentum-archive.cube'), conteudo, 'utf8');
}

console.log(`LUT ${TAMANHO}³ gerado com ${TAMANHO ** 3} amostras em public/lut e apps/web/public/lut.`);
