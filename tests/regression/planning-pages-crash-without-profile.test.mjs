import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito (teste manual, 20/11/2026): antes do onboarding, GET /api/obligations,
   /api/incomes e /api/categories respondem `{ hasProfile: false }`, sem a lista.
   As telas Faturas e recorrências, Rendas previstas e Categorias liam
   `x.obligations` (undefined) e a tela inteira caía em "Esta tela não pode ser
   exibida". O esperado é o mesmo estado das outras áreas sem perfil
   (Cartões, Metas): ilustração, uma frase do motivo e "Configurar perfil". */

const source = await readFile(new URL('../../src/components/financial-planning.tsx', import.meta.url), 'utf8');

function body(name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.notEqual(start, -1, name);
  const next = source.indexOf('\nexport function ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

for (const [page, list] of [['ObligationsPage', 'obligations'], ['IncomesPage', 'incomes'], ['CategoriesPage', 'categories']]) {
  test(`${page} não lê a lista quando a resposta diz que não há perfil`, () => {
    const code = body(page);
    assert.match(code, /hasProfile/, `${page} ignora hasProfile`);
    assert.doesNotMatch(code, new RegExp(`setItems\\(x\\.${list}\\)`), `${page} grava a lista sem conferir o perfil`);
    assert.match(code, /<NoProfile /, `${page} não mostra o estado sem perfil`);
  });
}

test('o estado sem perfil leva ao onboarding', () => {
  const start = source.indexOf('function NoProfile(');
  assert.notEqual(start, -1);
  const code = source.slice(start, source.indexOf('\n}', start));
  assert.match(code, /href="\/onboarding"/);
  assert.match(code, /Configurar perfil/);
  assert.match(code, /<StateArt /);
});
