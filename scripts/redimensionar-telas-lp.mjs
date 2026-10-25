/* Gera as variantes de 640 px das capturas do sistema exibidas na LP.

   As telas originais têm 1120 px e eram servidas inteiras ao celular, onde
   ocupam no máximo uns 350 px CSS. Com a variante menor no srcset, o
   navegador escolhe o arquivo pela largura real da tela.

   Usa o sharp que o Next já instala como dependência; nenhum pacote novo.
   Uso: node scripts/redimensionar-telas-lp.mjs */

import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const telas = join(raiz, 'apps', 'web', 'public', 'telas');
const sharp = createRequire(createRequire(join(raiz, 'package.json')).resolve('next/package.json'))('sharp');

const LARGURA = 640;

for (const arquivo of readdirSync(telas)) {
  if (!arquivo.endsWith('.webp') || arquivo.endsWith(`-${LARGURA}.webp`)) continue;
  const origem = join(telas, arquivo);
  const destino = origem.replace(/\.webp$/, `-${LARGURA}.webp`);
  await sharp(origem).resize({ width: LARGURA }).webp({ quality: 82, effort: 6 }).toFile(destino);
  console.log(`${arquivo}: ${statSync(origem).size} -> ${statSync(destino).size} bytes`);
}
