/* Gera as ilustrações de estado integradas a cada fundo (docs/ESTADOS_VAZIOS.md).

   Os mestres em design/estados-vetor/ foram vetorizados das ilustrações flat
   e trazem uma placa e áreas de "papel" na cor #F4F1EA. Uma ilustração só
   parece integrada quando o papel tem exatamente a cor da superfície onde ela
   aparece; por isso cada destino recebe a sua versão:

   - public/estados/claro/   papel = superfície clara do app (#FFFDF8);
   - public/estados/escuro/  papel = superfície escura do app (#2A2622), neutros
                             invertidos e marrons clareados para manter contraste;
   - apps/web/public/estados/ papel = fundo da LP (#F4F1EA), só as chaves da LP.

   A placa sai em todas: o fundo passa a ser o da própria superfície.

   Uso: node scripts/gerar-estados.mjs */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const MESTRES = join(raiz, 'design', 'estados-vetor');
const PAPEL = '#f4f1ea';
const LP = ['nao-encontrada', 'erro-tela', 'sem-versoes'];

const TEMAS = {
  claro: { papel: '#fffdf8', escuro: false },
  escuro: { papel: '#2a2622', escuro: true },
};

/* ── Conversões sRGB ⇄ Lab (D65) ─────────────────────────────────── */
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const gam = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const fi = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);

function paraLab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function paraHex([L, a, bb]) {
  const y = (L + 16) / 116;
  const X = fi(a / 500 + y) * 0.95047;
  const Y = fi(y);
  const Z = fi(y - bb / 200) * 1.08883;
  const r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  const g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  const b = X * 0.0557 + Y * -0.204 + Z * 1.057;
  return '#' + [r, g, b].map((c) => gam(c).toString(16).padStart(2, '0')).join('');
}

/* Tema escuro: tinta quase neutra e escura inverte a luminosidade (o ébano do
   contorno vira o tom claro do texto); neutros claros, como folhas e páginas,
   viram um creme apagado e continuam visíveis em vez de sumir no fundo; cores
   com matiz mantêm o matiz e sobem de luminosidade quando estariam escuras
   demais sobre #2A2622. */
export function corEscura(hex) {
  const [L, a, b] = paraLab(hex);
  const croma = Math.hypot(a, b);
  if (croma < 14) {
    // Matiz quente do texto claro da marca (#F1ECE3), sem o tom rosado que a
    // inversão pura deixava nos marrons quase neutros.
    if (L > 75) return paraHex([66, 1.5, 8]);
    return paraHex([Math.min(86, Math.max(24, 90 - L * 0.85)), 1.5, 6]);
  }
  if (L < 58) return paraHex([Math.min(78, L + 26), a, b]);
  return hex;
}

export function variante(svg, { papel, escuro }) {
  return svg
    .replace(/<rect [^>]*\/>/, '')
    .replace(/(fill|stroke)="(#[0-9a-fA-F]{6})"/g, (_, atributo, cor) => {
      const c = cor.toLowerCase();
      if (c === PAPEL) return `${atributo}="${papel}"`;
      return `${atributo}="${escuro ? corEscura(c) : c}"`;
    });
}

const escrever = (caminho, conteudo) => {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
};

function gerar() {
  const chaves = readdirSync(MESTRES).filter((nome) => nome.endsWith('.svg')).map((nome) => nome.slice(0, -4));
  for (const chave of chaves) {
    const mestre = readFileSync(join(MESTRES, `${chave}.svg`), 'utf8');
    for (const [tema, opcoes] of Object.entries(TEMAS))
      escrever(join(raiz, 'public', 'estados', tema, `${chave}.svg`), variante(mestre, opcoes));
    if (LP.includes(chave))
      escrever(join(raiz, 'apps', 'web', 'public', 'estados', `${chave}.svg`), variante(mestre, { papel: PAPEL, escuro: false }));
  }
  console.log(`${chaves.length} ilustrações geradas para os temas claro e escuro`);
}

// Gera só quando executado (pnpm estados:gerar); importar para testar não escreve arquivos.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) gerar();
