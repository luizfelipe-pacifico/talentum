/* Avisos de licença que acompanham os instaladores (docs/BEST_PRACTICES.md, "Desktop packages").

   As licenças MIT, BSD, ISC, Apache-2.0, MPL-2.0, CC-BY-4.0, OFL-1.1 e LGPL-3.0
   dos pacotes de produção pedem que o aviso e o texto da licença acompanhem as
   cópias distribuídas. O servidor empacotado leva esses pacotes, muitos
   compilados dentro dos chunks do Next, onde o texto da licença se perde.

   Gera, a partir de `pnpm licenses list --prod --json`:
   - <saida>/THIRD_PARTY_NOTICES.txt: nome, versão, licença, página e o texto
     da licença de cada pacote de produção;
   - <saida>/LICENSE.txt: a licença do próprio Talentum.
   O Electron e o Chromium trazem os próprios avisos (LICENSE.electron.txt e
   LICENSES.chromium.html), copiados pelo electron-builder.

   Uso: node scripts/third-party-notices.mjs [saida]. */

import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const output = path.resolve(process.argv[2] ?? '.next/licencas');

async function licenseText(dir) {
  const names = await readdir(dir).catch(() => []);
  const file = names.find((name) => /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i.test(name))
    ?? names.find((name) => /^(licen[cs]e|copying)/i.test(name));
  return file ? (await readFile(path.join(dir, file), 'utf8')).trim() : null;
}

const { stdout } = await run('pnpm', ['licenses', 'list', '--prod', '--json'], { maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
const groups = JSON.parse(stdout);
const entries = [];
for (const [license, packages] of Object.entries(groups)) {
  for (const item of packages) {
    for (const [index, version] of item.versions.entries()) {
      entries.push({ name: item.name, version, license, homepage: item.homepage, dir: item.paths[index] ?? item.paths[0] });
    }
  }
}
entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const sections = [];
for (const entry of entries) {
  const text = await licenseText(entry.dir);
  sections.push(
    [
      `${entry.name} ${entry.version}`,
      `Licença: ${entry.license}`,
      entry.homepage ? `Página: ${entry.homepage}` : null,
      '',
      text ?? `O pacote não traz o texto da licença; vale o texto oficial de ${entry.license} (https://spdx.org/licenses/${entry.license}.html).`,
    ]
      .filter((line) => line !== null)
      .join('\n'),
  );
}

const header = [
  'Talentum: avisos de licença de terceiros',
  '',
  'O Talentum é distribuído sob a licença MIT (LICENSE.txt, nesta pasta). Ele inclui os',
  `componentes abaixo (${entries.length} pacotes de produção), cada um sob a própria licença.`,
  'O código-fonte de cada componente está na página indicada ou no registro npm.',
  'O Electron e o Chromium trazem os próprios avisos: LICENSE.electron.txt e',
  'LICENSES.chromium.html, na pasta do aplicativo.',
].join('\n');

await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'THIRD_PARTY_NOTICES.txt'), `${header}\n\n${'='.repeat(72)}\n\n${sections.join(`\n\n${'-'.repeat(72)}\n\n`)}\n`);
await copyFile('LICENSE', path.join(output, 'LICENSE.txt'));
console.log(`${entries.length} pacotes de produção em ${path.join(output, 'THIRD_PARTY_NOTICES.txt')}`);
