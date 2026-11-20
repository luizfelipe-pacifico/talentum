import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

/* A landing page anunciava o que o repositório não tinha e escondia o que já
   tinha: importação de PDF como pronta (PDF é a etapa 7, planejada), modo de
   sobrevivência e ARCA sem marca de planejado, a importação de OFX como
   planejada depois de pronta e o arquivo LICENSE como pendente depois de
   versionado. A regra no topo de landing-page.tsx diz que nada planejado pode
   ser apresentado como pronto; estes testes a mantêm presa ao ROADMAP. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const lp = () => read('apps/web/src/components/lp/landing-page.tsx');

function section(source, id) {
  const start = source.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `a seção #${id} existe`);
  const end = source.indexOf('</section>', start);
  return source.slice(start, end);
}

function stageStatus(roadmap, heading) {
  const start = roadmap.indexOf(heading);
  assert.notEqual(start, -1, `${heading} existe no ROADMAP`);
  const next = roadmap.indexOf('\n### ', start + heading.length);
  return roadmap.slice(start, next === -1 ? undefined : next);
}

test('a importação de PDF só aparece como planejada enquanto a etapa 7 estiver planejada', async () => {
  const [source, roadmap] = await Promise.all([lp(), read('docs/ROADMAP.md')]);
  const stage7 = stageStatus(roadmap, '### Stage 7 — PDF import');
  if (!/\*\*Current\*\*/.test(stage7)) {
    assert.doesNotMatch(source, /OFX ou PDF|PDF e OFX|PDF ou OFX|OFX e PDF/, 'PDF anunciado como formato pronto');
    for (const match of source.matchAll(/[^.\n]*\bPDF\b[^.\n]*/g)) {
      assert.match(match[0], /planejad/i, `menção a PDF sem marca de planejado: "${match[0].trim()}"`);
    }
  }
});

test('a linha do tempo não chama de planejado o que o ROADMAP marca como pronto', async () => {
  const [source, roadmap] = await Promise.all([lp(), read('docs/ROADMAP.md')]);
  const mvp4 = stageStatus(roadmap, '### MVP 4 — CSV and OFX import');
  assert.match(mvp4, /Status \(\*\*Current\*\*\)/);
  assert.doesNotMatch(source, /Importação de OFX', state: 'planejado'/);
  const linha = source.match(/title: 'Importação de (?:OFX e CSV|CSV e OFX)', state: '([^']+)'/);
  assert.ok(linha, 'a linha do tempo lista a importação de OFX e CSV');
  assert.equal(linha[1], 'pronto');
});

test('o arquivo LICENSE não é anunciado como pendente depois de existir', async () => {
  await access(new URL('LICENSE', root));
  assert.doesNotMatch(await lp(), /licença definitiva ainda precisa ser formalizada/i);
  // Os Termos de Uso, abertos pelo rodapé da LP, repetiam a mesma pendência.
  assert.doesNotMatch(await read('apps/web/src/components/lp/legal.tsx'), /ainda será formalizada em arquivo/i);
});

test('modo de sobrevivência e patrimônio ARCA aparecem marcados como planejados', async () => {
  const source = await lp();
  for (const id of ['sobrevivencia', 'arca']) {
    assert.match(section(source, id), /Planejad/, `#${id} sem marca de planejado`);
  }
});
