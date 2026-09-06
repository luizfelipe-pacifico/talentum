/* Prepara os assets de imagem da landing page.

   Os arquivos icon-talentum-*.svg da raiz são, na prática, PNGs embutidos em
   base64 dentro de um invólucro SVG: pesam ~192 KB cada e não são vetores de
   verdade. Este script extrai o bitmap e gera derivados WebP responsivos,
   conforme docs/BRANDING.md ("converter imagem fotográfica ou ilustrativa da
   landing page para WebP antes do bundle de produção").

   Requisito: ffmpeg no PATH. Uso: node scripts/preparar-imagens-lp.mjs */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destinos = [join(raiz, 'public', 'marca'), join(raiz, 'apps', 'web', 'public', 'marca')];
const temporario = join(raiz, 'temp', 'marca');

const origens = [
  { svg: 'icon-talentum-light.svg', nome: 'talentum-clara' },
  { svg: 'icon-talentum-dark.svg', nome: 'talentum-escura' },
];

const larguras = [64, 128, 256];

function extrairPng(caminhoSvg) {
  const svg = readFileSync(caminhoSvg, 'utf8');
  const encontrado = svg.match(/href="data:image\/png;base64,([^"]+)"/);
  if (!encontrado) throw new Error(`Sem PNG embutido em ${caminhoSvg}`);
  return Buffer.from(encontrado[1], 'base64');
}

mkdirSync(temporario, { recursive: true });
for (const destino of destinos) mkdirSync(destino, { recursive: true });

for (const origem of origens) {
  const png = join(temporario, `${origem.nome}.png`);
  writeFileSync(png, extrairPng(join(raiz, origem.svg)));

  for (const largura of larguras) {
    const primeiro = join(destinos[0], `${origem.nome}-${largura}.webp`);
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel', 'error',
        '-i', png,
        '-vf', `scale=${largura}:-1:flags=lanczos`,
        '-c:v', 'libwebp',
        '-lossless', '0',
        '-quality', '86',
        '-compression_level', '6',
        primeiro,
      ],
      { stdio: 'inherit' },
    );

    // O pacote da Vercel não pode importar nada do desktop: cada app leva sua cópia.
    for (const destino of destinos.slice(1)) {
      writeFileSync(join(destino, `${origem.nome}-${largura}.webp`), readFileSync(primeiro));
    }

    console.log(`${origem.nome}-${largura}.webp — ${statSync(primeiro).size} bytes`);
  }
}

rmSync(temporario, { recursive: true, force: true });
console.log('Assets WebP gerados em public/marca e apps/web/public/marca.');
