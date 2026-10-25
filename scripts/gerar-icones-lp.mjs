/* Gera o mapa de ícones SVG da landing page.

   A LP usava a fonte do Bootstrap Icons: 131 KB de fonte e uma folha com
   mais de duas mil classes para desenhar cerca de quarenta ícones. Este
   script varre os componentes da LP, encontra cada `bi-<nome>` usado e copia
   o SVG oficial do pacote `bootstrap-icons` (licença MIT) para um mapa
   embutido. A família continua sendo o Bootstrap Icons, só a entrega muda.

   Uso: node scripts/gerar-icones-lp.mjs */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const componentes = join(raiz, 'apps', 'web', 'src', 'components', 'lp');
const pacote = join(raiz, 'node_modules', 'bootstrap-icons');
const destino = join(componentes, 'icons.tsx');

const nomes = new Set();
for (const arquivo of readdirSync(componentes)) {
  if (!arquivo.endsWith('.tsx') || arquivo === 'icons.tsx') continue;
  const fonte = readFileSync(join(componentes, arquivo), 'utf8');
  for (const [, nome] of fonte.matchAll(/['"`\s]bi-([a-z0-9-]+)/g)) nomes.add(nome);
}

const versao = JSON.parse(readFileSync(join(pacote, 'package.json'), 'utf8')).version;
const entradas = [...nomes].sort().map((nome) => {
  const svg = readFileSync(join(pacote, 'icons', `${nome}.svg`), 'utf8');
  if (!/viewBox="0 0 16 16"/.test(svg)) throw new Error(`viewBox inesperado em ${nome}`);
  const corpo = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\s*\n\s*/g, '')
    .trim();
  return `  'bi-${nome}': ${JSON.stringify(corpo)},`;
});

writeFileSync(
  destino,
  `/* Gerado por scripts/gerar-icones-lp.mjs a partir de bootstrap-icons ${versao}
   (licença MIT, https://icons.getbootstrap.com/). Não edite à mão: rode o
   script depois de usar um ícone novo na LP. */

export const ICONES: Record<string, string> = {
${entradas.join('\n')}
};
`,
);

console.log(`${entradas.length} ícones gravados em ${destino}`);
