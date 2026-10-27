import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Ilustrações que saíram cortadas ou incompletas (27 de outubro de 2026):

   - nao-encontrada: o chão terminava em corte reto nas duas laterais, herdado
     do limite da imagem original;
   - sem-cartoes e importar-extrato: o cartão e a folha, creme e sem contorno,
     eram engolidos junto com o papel do fundo na vetorização;
   - no tema escuro, tons claros neutros (folhas, páginas) viravam escuros e
     desapareciam sobre a superfície #2A2622. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const { corEscura, variante } = await import(new URL('scripts/gerar-estados.mjs', root).href);

const lightness = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};

test('o chão da página não encontrada fecha em meia-lua, sem corte lateral', async () => {
  const svg = await read('design/estados-vetor/nao-encontrada.svg');
  assert.match(svg, /<clipPath id="meia-lua">/);
  assert.match(svg, /<g clip-path="url\(#meia-lua\)">/);
  // A meia-lua de areia estende o chão até fechar a curva, e o contorno a arremata.
  assert.match(svg, /<path d="M104 600 A407 250 0 0 0 918 600 Z" fill="#[0-9a-f]{6}"\/>/i);
  assert.match(svg, /<path d="M104 600 A407 250 0 0 0 918 600" fill="none" stroke="#[0-9a-f]{6}"/i);
});

test('a folha que entra na bandeja de importação está inteira', async () => {
  const svg = await read('design/estados-vetor/importar-extrato.svg');
  assert.match(svg, /<path d="M379 329 H584 L640 385 V524 H379 Z" fill="#f6f4e5"\/>/);
  assert.match(svg, /<path d="M584 329 V385 H640 Z" fill="#[0-9a-f]{6}"\/>/i);
});

test('no tema escuro, tons claros neutros continuam visíveis', () => {
  const surface = lightness('#2a2622');
  for (const paper of ['#f6f4e5', '#f2ede3', '#ffffff'])
    assert.ok(lightness(corEscura(paper)) - surface > 0.3, `${paper} some no escuro: ${corEscura(paper)}`);
  // O contorno ébano continua virando tom claro.
  assert.ok(lightness(corEscura('#1a110a')) > 0.7);
});

test('o gerador não remove o recorte nem a meia-lua', () => {
  const master = '<svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" fill="#F4F1EA"/><defs><clipPath id="meia-lua"><path d="M0 0 H10 Z"/></clipPath></defs><g clip-path="url(#meia-lua)"><path d="M1 1" fill="#e2c59d"/></g></svg>';
  const out = variante(master, { papel: '#fffdf8', escuro: false });
  assert.doesNotMatch(out, /<rect /);
  assert.match(out, /<clipPath id="meia-lua"><path d="M0 0 H10 Z"\/><\/clipPath>/);
  assert.match(out, /clip-path="url\(#meia-lua\)"/);
});
