import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio,
  parseHex,
  toOklch,
  validatePalette,
} from '../scripts/validate-palette.mjs';

/* Validador de paleta.

   A aferição que importa não é "o código roda": é **reproduzir os veredictos já
   registrados em docs/DASHBOARD.md**. Se o validador discordar da auditoria que
   o documento descreve, um dos dois está errado, e o teste precisa gritar. */

const verdict = (hexes, options) => validatePalette(hexes, options);
const check = (result, name) => result.checks.find((item) => item.name.startsWith(name));

test('mede a lightness e o croma registrados na auditoria D-5', () => {
  // O documento anota "#5C4033 L=0.399" e "C=0.045". São números aferíveis.
  const nogueira = toOklch(parseHex('#5C4033'));
  assert.equal(nogueira.L.toFixed(3), '0.399');
  assert.equal(nogueira.C.toFixed(3), '0.045');

  const nogueiraEscura = toOklch(parseHex('#8A6A57'));
  assert.equal(nogueiraEscura.C.toFixed(2), '0.05');
});

test('mede os contrastes registrados em R-15', () => {
  // "verde-água 2.77:1, amarelo 2.13:1, magenta 2.65:1" sobre #FFFDF8.
  const surface = parseHex('#FFFDF8');
  assert.equal(contrastRatio(parseHex('#1baf7a'), surface).toFixed(2), '2.77');
  assert.equal(contrastRatio(parseHex('#eda100'), surface).toFixed(2), '2.13');
  assert.equal(contrastRatio(parseHex('#e87ba4'), surface).toFixed(2), '2.65');
});

test('reprova o par marrom da auditoria D-5 no tema claro', () => {
  const result = verdict(['#5C4033', '#B8773D'], { mode: 'light', surface: '#FFFDF8' });
  assert.equal(result.ok, false);
  assert.equal(check(result, 'faixa de luminosidade').status, 'FAIL');
  assert.equal(check(result, 'piso de croma').status, 'FAIL');
});

test('reprova o par marrom no tema escuro, inclusive para visão plena', () => {
  // A linha mais séria de D-5: nem quem enxerga todas as cores separa os dois.
  const result = verdict(['#8A6A57', '#B8773D'], { mode: 'dark', surface: '#2A2622' });
  assert.equal(result.ok, false);
  assert.equal(check(result, 'piso de croma').status, 'FAIL');
  assert.equal(check(result, 'piso de visão normal').status, 'FAIL');
});

test('aprova a paleta de oito slots de R-15 nos dois temas', () => {
  const claro = verdict(['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'], {
    mode: 'light',
    surface: '#FFFDF8',
  });
  assert.equal(claro.ok, true);
  // O documento registra WARN de contraste em três slots, não reprovação.
  assert.equal(check(claro, 'contraste').status, 'WARN');
  assert.equal(check(claro, 'contraste').detail.length, 3);

  const escuro = verdict(['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'], {
    mode: 'dark',
    surface: '#2A2622',
  });
  assert.equal(escuro.ok, true);
  assert.ok(escuro.checks.every((item) => item.status === 'PASS'), 'no escuro o documento registra os cinco PASS');
});

test('o cinza de desênfase só passa quando declarado neutro', () => {
  // Ele é acromático de propósito: cobrar croma dele seria reprovar a cor por
  // fazer exatamente o que se espera.
  const semDeclarar = verdict(['#2a78d6', '#898781'], { mode: 'light', surface: '#FFFDF8' });
  assert.equal(check(semDeclarar, 'piso de croma').status, 'FAIL');

  const declarado = verdict(['#2a78d6', '#898781'], {
    mode: 'light',
    surface: '#FFFDF8',
    neutrals: ['#898781'],
  });
  assert.equal(declarado.ok, true);
});

test('marcar neutro é declaração explícita, não inferência por croma baixo', () => {
  // Se fosse automático, o defeito D-5 — a Nogueira lendo como cinza sem querer
  // — passaria despercebido para sempre.
  const result = verdict(['#5C4033', '#B8773D'], { mode: 'light', surface: '#FFFDF8' });
  assert.equal(check(result, 'piso de croma').status, 'FAIL');
});

test('aprova os tokens de ganho e perda ratificados, nos dois temas', () => {
  const claro = verdict(['#2a78d6', '#157f52', '#b32d22', '#898781'], {
    mode: 'light',
    surface: '#FFFDF8',
    neutrals: ['#898781'],
    pairs: 'all',
  });
  assert.equal(claro.ok, true, 'tema claro reprovou');
  assert.ok(claro.checks.every((item) => item.status === 'PASS'), 'claro: nem WARN é aceitável aqui');

  const escuro = verdict(['#3987e5', '#4fbf85', '#dd5d50', '#898781'], {
    mode: 'dark',
    surface: '#2A2622',
    neutrals: ['#898781'],
    pairs: 'all',
  });
  assert.equal(escuro.ok, true, 'tema escuro reprovou');
  assert.ok(escuro.checks.every((item) => item.status === 'PASS'));
});

test('ganho e perda ficam acima do alvo de separação sob daltonismo', () => {
  for (const [mode, surface, gain, loss] of [
    ['light', '#FFFDF8', '#157f52', '#b32d22'],
    ['dark', '#2A2622', '#4fbf85', '#dd5d50'],
  ]) {
    const result = verdict([gain, loss], { mode, surface });
    for (const kind of ['separação sob protanopia', 'separação sob deuteranopia']) {
      const measured = Number(check(result, kind).note.match(/pior ΔE ([\d.]+)/)[1]);
      assert.ok(measured >= 8, `${mode}/${kind}: ΔE ${measured} abaixo do alvo 8`);
    }
  }
});

test('recusa cor malformada em vez de adivinhar', () => {
  assert.throws(() => parseHex('#12345'));
  assert.throws(() => parseHex('vermelho'));
});
