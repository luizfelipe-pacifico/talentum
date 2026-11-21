import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* A 960, 1024 e 1180px a página rolava 1px na horizontal: antes de aparecer,
   o bloco com entrada pela direita (.lp-reveal-right, deslocado 26px) passava
   da borda da tela. As seções recortam o excesso horizontal com overflow-x:
   clip, que não cria contêiner de rolagem e não quebra o cabeçalho sticky. */

test('as seções recortam o deslocamento horizontal das entradas animadas', async () => {
  const css = (await readFile(new URL('../../apps/web/src/styles/lp.css', import.meta.url), 'utf8')).replace(/\s+/g, ' ');
  const regra = css.match(/ \.lp-section \{([^}]*)\}/)?.[1] ?? '';
  assert.match(regra, /overflow-x: clip/);
  assert.doesNotMatch(regra, /overflow(-x)?: (hidden|auto|scroll)/, 'hidden criaria um contêiner de rolagem');
});
