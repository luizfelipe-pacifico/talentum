#!/usr/bin/env node
/* Validador de paleta de visualização.

   `docs/DASHBOARD.md`, R-20: "Nenhuma paleta entra no produto sem passar pelo
   validador, nos dois temas." O documento descrevia as cinco verificações e
   registrava seus resultados, mas anotava que o script usado na pesquisa não
   estava versionado. Este arquivo fecha essa pendência.

   A verificação de cor é computável — portanto compute. Estimar se um par é
   seguro para daltonismo é como se chega a dois marrons vizinhos passando por
   paleta categórica, que foi exatamente o defeito D-5 da auditoria.

   Uso:
     node scripts/validate-palette.mjs "<hex,hex,...>" --mode light --surface "#FFFDF8"
     node scripts/validate-palette.mjs "<hex,hex,...>" --mode dark  --surface "#2A2622"
     node scripts/validate-palette.mjs ... --pairs all   (dispersão, mapas, bolhas)
     node scripts/validate-palette.mjs ... --json

   Saída: relatório por verificação e código de saída 1 quando algo reprova. */

/* ── Conversões de cor ──────────────────────────────────────────── */

/** Lê `#rgb` ou `#rrggbb` em canais sRGB de 0 a 1. */
export function parseHex(hex) {
  const value = String(hex).trim().replace(/^#/, '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`cor inválida: ${hex}`);
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255);
}

/** Remove a curva de transferência do sRGB. */
const linearize = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/** Luminância relativa da WCAG 2.2, usada no contraste. */
export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste da WCAG entre duas cores. */
export function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** sRGB linear para XYZ, iluminante D65. */
function toXyz(rgb) {
  const [r, g, b] = rgb.map(linearize);
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

const D65 = [0.9504559, 1, 1.0890578];

/** XYZ para CIELAB. Base do ΔE2000. */
export function toLab(rgb) {
  const [x, y, z] = toXyz(rgb).map((value, index) => value / D65[index]);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t / 116 + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * sRGB para OKLab.
 *
 * OKLab é usado na faixa de luminosidade e no piso de croma porque sua
 * lightness é perceptualmente mais uniforme que a do CIELAB — é a escala em que
 * os valores registrados em `docs/DASHBOARD.md` foram medidos.
 */
export function toOklab(rgb) {
  const [r, g, b] = rgb.map(linearize);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Lightness e croma em OKLCh. */
export function toOklch(rgb) {
  const [L, a, b] = toOklab(rgb);
  return { L, C: Math.hypot(a, b) };
}

/* ── Diferença perceptual ───────────────────────────────────────── */

/** CIEDE2000. A métrica que corresponde ao que o olho percebe como distância. */
export function deltaE2000(rgbA, rgbB) {
  const [L1, a1, b1] = toLab(rgbA);
  const [L2, a2, b2] = toLab(rgbB);

  const kL = 1, kC = 1, kH = 1;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const meanC = (C1 + C2) / 2;

  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const deg = (radians) => (radians * 180) / Math.PI;
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const hue = (b, ap) => {
    if (b === 0 && ap === 0) return 0;
    const angle = deg(Math.atan2(b, ap));
    return angle >= 0 ? angle : angle + 360;
  };

  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  const meanLp = (L1 + L2) / 2;
  const meanCp = (C1p + C2p) / 2;

  let meanHp;
  if (C1p * C2p === 0) meanHp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) meanHp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) meanHp = (h1p + h2p + 360) / 2;
  else meanHp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(meanHp - 30)) +
    0.24 * Math.cos(rad(2 * meanHp)) +
    0.32 * Math.cos(rad(3 * meanHp + 6)) -
    0.2 * Math.cos(rad(4 * meanHp - 63));

  const dTheta = 30 * Math.exp(-(((meanHp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(meanCp ** 7 / (meanCp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (meanLp - 50) ** 2) / Math.sqrt(20 + (meanLp - 50) ** 2);
  const Sc = 1 + 0.045 * meanCp;
  const Sh = 1 + 0.015 * meanCp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt(
    (dLp / (kL * Sl)) ** 2 +
      (dCp / (kC * Sc)) ** 2 +
      (dHp / (kH * Sh)) ** 2 +
      Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh)),
  );
}

/* ── Simulação de daltonismo ────────────────────────────────────── */

/* Viénot, Brettel & Mollon (1999): projeção no plano de confusão em espaço
   LMS. É o método padrão para protanopia e deuteranopia, as duas formas que
   respondem por quase toda a deficiência de visão de cores — cerca de 1 em
   cada 12 homens (docs/DASHBOARD.md, R-19). */

const RGB_TO_LMS = [
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
];

const LMS_TO_RGB = [
  [0.080944448, -0.13050440, 0.116721066],
  [-0.010248533, 0.054019326, -0.113614708],
  [-0.000365294, -0.004121614, 0.693511405],
];

const PROTAN = [
  [0, 2.02344, -2.52581],
  [0, 1, 0],
  [0, 0, 1],
];

const DEUTAN = [
  [1, 0, 0],
  [0.494207, 0, 1.24827],
  [0, 0, 1],
];

const apply = (matrix, vector) => matrix.map((row) => row.reduce((sum, value, i) => sum + value * vector[i], 0));

/** Simula como a paleta é vista sob protanopia ou deuteranopia. */
export function simulateCvd(rgb, kind) {
  const linear = rgb.map(linearize);
  const lms = apply(RGB_TO_LMS, linear);
  const projected = apply(kind === 'protan' ? PROTAN : DEUTAN, lms);
  const back = apply(LMS_TO_RGB, projected);
  const delinearize = (channel) => {
    const clamped = Math.min(Math.max(channel, 0), 1);
    return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };
  return back.map(delinearize);
}

/* ── Limiares ───────────────────────────────────────────────────── */

/* Os pisos de ΔE e de contraste estão declarados em `docs/DASHBOARD.md`,
   "Como validar". Os de luminosidade e croma foram calibrados para reproduzir
   os veredictos já registrados na auditoria D-5 e na medição de R-15 — é assim
   que se verifica que o validador mede a mesma coisa que o documento afirma. */
export const THRESHOLDS = {
  /**
   * Faixa de lightness OKLab aceitável para marca sobre cada superfície.
   *
   * Calibrada para reproduzir os dois veredictos registrados em
   * `docs/DASHBOARD.md`: a Nogueira `#5C4033` (L=0.399) reprova, e o violeta
   * `#4a3aa7` (L=0.433) da paleta de R-15 passa.
   */
  lightness: { light: [0.42, 0.85], dark: [0.5, 0.9] },
  /** Abaixo deste croma a marca lê como cinza e deixa de ser categoria. */
  chroma: 0.06,
  /** Separação sob daltonismo. Entre 6 e 8 só com codificação secundária. */
  cvd: { floor: 6, target: 8 },
  /** Portão rígido: abaixo disto nem visão plena separa as séries. */
  normalVision: 15,
  /** Contraste contra a superfície. Abaixo disto exige canal de alívio. */
  contrast: 3,
};

/* ── Verificações ───────────────────────────────────────────────── */

function checkLightness(colors, mode) {
  const [min, max] = THRESHOLDS.lightness[mode];
  const failures = colors.filter(({ oklch }) => oklch.L < min || oklch.L > max);
  return {
    name: 'faixa de luminosidade',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    detail: failures.map(({ hex, oklch }) => `${hex} L=${oklch.L.toFixed(3)}`),
    note: `faixa aceita ${min}–${max}`,
  };
}

/**
 * Piso de croma, aplicado só às marcas categóricas.
 *
 * O cinza de desênfase — `--data-recessive`, que veste "Outros" e "Sem
 * categoria" — é acromático de propósito: ele existe para **não** disputar
 * atenção. Cobrar croma dele seria reprovar a cor por fazer o que se espera.
 * Marcar como neutra é declaração explícita de quem roda o validador, não
 * inferência por croma baixo — do contrário o defeito D-5, em que a Nogueira
 * lia como cinza sem querer, passaria despercebido.
 */
function checkChroma(colors) {
  const categorical = colors.filter((color) => !color.neutral);
  const failures = categorical.filter(({ oklch }) => oklch.C < THRESHOLDS.chroma);
  const exempt = colors.filter((color) => color.neutral).map((color) => color.hex);
  return {
    name: 'piso de croma',
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    detail: failures.map(({ hex, oklch }) => `${hex} C=${oklch.C.toFixed(3)} — lê como cinza`),
    note: `piso ${THRESHOLDS.chroma}${exempt.length > 0 ? ` · neutras isentas: ${exempt.join(', ')}` : ''}`,
  };
}

/** Pares comparados: vizinhos por padrão, todos com `--pairs all`. */
function pairsOf(colors, all) {
  const pairs = [];
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      if (all || j === i + 1) pairs.push([colors[i], colors[j]]);
    }
  }
  return pairs;
}

function checkSeparation(colors, all, kind) {
  const pairs = pairsOf(colors, all);
  if (pairs.length === 0) return { name: `separação (${kind})`, status: 'PASS', detail: [], note: 'sem pares' };

  const measured = pairs.map(([a, b]) => {
    const left = kind === 'normal' ? a.rgb : simulateCvd(a.rgb, kind);
    const right = kind === 'normal' ? b.rgb : simulateCvd(b.rgb, kind);
    return { pair: `${a.hex} ↔ ${b.hex}`, delta: deltaE2000(left, right) };
  });

  const worst = measured.reduce((min, item) => (item.delta < min.delta ? item : min), measured[0]);

  if (kind === 'normal') {
    const failures = measured.filter((item) => item.delta < THRESHOLDS.normalVision);
    return {
      name: 'piso de visão normal',
      status: failures.length === 0 ? 'PASS' : 'FAIL',
      detail: failures.map((item) => `${item.pair} ΔE ${item.delta.toFixed(1)}`),
      note: `pior ΔE ${worst.delta.toFixed(1)} · portão rígido ${THRESHOLDS.normalVision}`,
    };
  }

  const failures = measured.filter((item) => item.delta < THRESHOLDS.cvd.floor);
  const warnings = measured.filter(
    (item) => item.delta >= THRESHOLDS.cvd.floor && item.delta < THRESHOLDS.cvd.target,
  );

  return {
    name: `separação sob ${kind === 'protan' ? 'protanopia' : 'deuteranopia'}`,
    status: failures.length > 0 ? 'FAIL' : warnings.length > 0 ? 'WARN' : 'PASS',
    detail: [...failures, ...warnings].map((item) => `${item.pair} ΔE ${item.delta.toFixed(1)}`),
    note: `pior ΔE ${worst.delta.toFixed(1)} · piso ${THRESHOLDS.cvd.floor}, alvo ${THRESHOLDS.cvd.target}`,
  };
}

function checkContrast(colors, surface) {
  const measured = colors.map(({ hex, rgb }) => ({ hex, ratio: contrastRatio(rgb, surface) }));
  const low = measured.filter((item) => item.ratio < THRESHOLDS.contrast);
  return {
    name: 'contraste contra a superfície',
    // Abaixo de 3:1 não reprova sozinho: obriga canal de alívio — rótulo direto
    // ou tabela equivalente, que R-11 já exige de todo gráfico.
    status: low.length === 0 ? 'PASS' : 'WARN',
    detail: low.map((item) => `${item.hex} ${item.ratio.toFixed(2)}:1`),
    note: `piso ${THRESHOLDS.contrast}:1 — abaixo disso exige rótulo direto ou tabela`,
  };
}

/** Roda as cinco verificações sobre uma paleta e uma superfície. */
export function validatePalette(
  hexes,
  { mode = 'light', surface = '#FFFDF8', pairs = 'adjacent', neutrals = [] } = {},
) {
  const neutralSet = new Set(neutrals.map((value) => value.toLowerCase()));
  const colors = hexes.map((hex) => {
    const rgb = parseHex(hex);
    return { hex, rgb, oklch: toOklch(rgb), neutral: neutralSet.has(hex.toLowerCase()) };
  });
  const surfaceRgb = parseHex(surface);
  const all = pairs === 'all';

  const checks = [
    checkLightness(colors, mode),
    checkChroma(colors),
    checkSeparation(colors, all, 'protan'),
    checkSeparation(colors, all, 'deutan'),
    checkSeparation(colors, all, 'normal'),
    checkContrast(colors, surfaceRgb),
  ];

  return {
    mode,
    surface,
    colors: colors.map(({ hex, oklch }) => ({ hex, L: oklch.L, C: oklch.C })),
    checks,
    ok: checks.every((check) => check.status !== 'FAIL'),
  };
}

/* ── Linha de comando ───────────────────────────────────────────── */

function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log('uso: node scripts/validate-palette.mjs "<hex,hex,...>" [--mode light|dark] [--surface "#RRGGBB"] [--pairs all] [--neutral "#RRGGBB"] [--json]');
    return 0;
  }

  const flag = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? fallback : args[index + 1];
  };

  const hexes = args[0].split(',').map((value) => value.trim()).filter(Boolean);
  const mode = flag('mode', 'light');
  const surface = flag('surface', mode === 'dark' ? '#2A2622' : '#FFFDF8');
  const pairs = args.includes('--pairs') ? flag('pairs', 'adjacent') : 'adjacent';
  const neutrals = args.includes('--neutral') ? flag('neutral', '').split(',').map((v) => v.trim()).filter(Boolean) : [];

  const result = validatePalette(hexes, { mode, surface, pairs, neutrals });

  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  console.log(`paleta: ${hexes.join(', ')}`);
  console.log(`tema: ${mode} · superfície ${surface} · pares: ${pairs}\n`);
  for (const { hex, L, C } of result.colors) {
    console.log(`  ${hex}  L=${L.toFixed(3)}  C=${C.toFixed(3)}`);
  }
  console.log('');
  for (const check of result.checks) {
    console.log(`  ${check.status.padEnd(4)} ${check.name} — ${check.note}`);
    for (const line of check.detail) console.log(`         ${line}`);
  }
  console.log(`\nveredito: ${result.ok ? 'APROVADA' : 'REPROVADA'}`);
  return result.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate-palette.mjs')) {
  process.exit(main(process.argv));
}
