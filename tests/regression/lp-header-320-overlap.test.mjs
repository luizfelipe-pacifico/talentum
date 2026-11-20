import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* A 320px (Mobile S) o nome "Talentum" do cabeçalho invadia o botão
   "Seções": a marca terminava em 165px e o botão começava em 154px. Abaixo
   de 380px o botão mostra só o ícone e mantém o nome acessível. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('o rótulo "Seções" pode sair da vista sem sair do leitor de tela', async () => {
  const motion = await read('apps/web/src/components/lp/motion.tsx');
  assert.match(motion, /<span className="lp-nav-menu-label">Seções<\/span>/);
});

test('abaixo de 380px o botão de seções fica só com o ícone', async () => {
  const css = (await read('apps/web/src/styles/lp.css')).replace(/\s+/g, ' ');
  const bloco = css.match(/@media \(max-width: 379px\) \{(.*?)\} \}/)?.[1] ?? '';
  assert.match(bloco, /\.lp-nav-menu-label \{[^}]*clip-path: inset\(50%\)/);
});
