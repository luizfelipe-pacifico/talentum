import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito (revisão de contraste, 20/11/2026): o botão principal, o segmento
   e o filtro selecionados e os contadores pintavam texto claro (`--on-amber`,
   #fffdf8) sobre o âmbar puro (#b8773d): 3,6:1, abaixo dos 4,5:1 do WCAG 1.4.3
   para texto de 13 a 15 px. Links e o texto de destaque em âmbar puro também
   reprovavam: 3,2:1 sobre o pergaminho no tema claro e 4,1:1 sobre a
   superfície no escuro. A LP já resolvia isso com `--lp-amber-strong` e
   `--lp-amber-text`; o app passa a ter os mesmos papéis: o âmbar puro fica
   para bordas, anel de foco e marcas (3:1), e texto usa a variante que passa. */

const css = await readFile(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
const sheets = await Promise.all(
  ['globals.css', 'local-data.css', 'planning.css', 'styles.css', 'vault.css'].map((name) =>
    readFile(new URL(`../../src/app/${name}`, import.meta.url), 'utf8'),
  ),
);

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, selector);
  return css.slice(start, css.indexOf('}', start));
}

function tokens(selector) {
  const map = {};
  for (const [, name, value] of block(selector).matchAll(/(--[\w-]+):\s*([^;]+);/g)) map[name] = value.trim();
  return map;
}

const light = tokens(':root');
const dark = { ...light, ...tokens('html.dark') };

function resolve(theme, value) {
  let current = value;
  for (let i = 0; i < 5; i += 1) {
    const ref = /^var\((--[\w-]+)\)$/.exec(current);
    if (!ref) break;
    current = theme[ref[1]];
  }
  assert.match(current ?? '', /^#[0-9a-f]{6}$/i, `${value} não resolve para uma cor sólida`);
  return current;
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('texto claro sobre preenchimento âmbar passa 4,5:1 nos dois temas', () => {
  const rules = [...sheets.join('\n').matchAll(/([^{}]+)\{([^{}]*color:\s*var\(--on-amber\)[^{}]*)\}/g)];
  assert.ok(rules.length >= 5, 'regras com texto sobre âmbar');
  for (const [, selector, body] of rules) {
    const background = /background:\s*(var\(--[\w-]+\))/.exec(body)?.[1];
    assert.ok(background, `${selector.trim()}: sem fundo declarado`);
    for (const [name, theme] of [['claro', light], ['escuro', dark]]) {
      const value = ratio(resolve(theme, 'var(--on-amber)'), resolve(theme, background));
      assert.ok(value >= 4.5, `${selector.trim()} (${name}): ${value.toFixed(2)}:1`);
    }
  }
});

test('texto em âmbar passa 4,5:1 sobre fundo, superfície e área rebaixada', () => {
  for (const [name, theme] of [['claro', light], ['escuro', dark]]) {
    for (const surface of ['--bg', '--surface', '--sunken']) {
      for (const token of ['--amber-text', '--amber-text-hover']) {
        const value = ratio(resolve(theme, `var(${token})`), resolve(theme, `var(${surface})`));
        assert.ok(value >= 4.5, `${token} sobre ${surface} (${name}): ${value.toFixed(2)}:1`);
      }
    }
  }
});

test('nenhum texto usa o âmbar puro fora da barra lateral escura', () => {
  const sidebarOnly = /^(\.sidebar|\.nav-)/;
  for (const sheet of sheets) {
    for (const [, selector, body] of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(^|[^-])color:\s*var\(--amber(-hover)?\)/.test(body)) continue;
      const name = selector.trim();
      // Ícones são marca não textual (3:1), não texto.
      if (sidebarOnly.test(name) || /(^| )(i|\.bi)$|> i$/.test(name)) continue;
      assert.fail(`${name} usa âmbar puro como cor de texto`);
    }
  }
});
