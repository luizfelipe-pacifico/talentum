import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/* Ilustrações dos estados vazios (docs/ESTADOS_VAZIOS.md): vetoriais, cada uma
   no seu lugar, impossíveis de arrastar ou selecionar como texto. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const files = async (dir) => readdir(new URL(dir, root)).catch(() => []);

const map = await read('docs/ESTADOS_VAZIOS.md');
const KEYS = [...map.matchAll(/\| `([a-z-]+)` \|$/gm)].map((m) => m[1]);
const LP_KEYS = ['nao-encontrada', 'erro-tela', 'sem-versoes'];

test('o mapa lista as 19 chaves de ilustração', () => {
  assert.equal(KEYS.length, 19);
});

test('cada chave tem um SVG vetorial leve no app e, quando é da LP, também na LP', async () => {
  const checks = [...KEYS.flatMap((key) => [`public/estados/claro/${key}.svg`, `public/estados/escuro/${key}.svg`]), ...LP_KEYS.map((key) => `apps/web/public/estados/${key}.svg`)];
  for (const path of checks) {
    const svg = await read(path);
    assert.doesNotMatch(svg, /<image|base64/, path);
    assert.match(svg, /<path /, path);
    assert.match(svg, /aria-hidden="true"/, path);
    assert.ok(Buffer.byteLength(svg) < 200_000, `${path}: ${Buffer.byteLength(svg)} bytes`);
  }
});

test('nenhuma imagem de origem fica no diretório público', async () => {
  for (const dir of ['public/', 'public/assets/', 'public/estados/claro/', 'public/estados/escuro/', 'apps/web/public/estados/'])
    for (const name of await files(dir)) assert.doesNotMatch(name, /\.(jpe?g|png)$/i, `${dir}${name}`);
});

test('a ilustração não pode ser arrastada nem selecionada', async () => {
  for (const path of ['src/components/state-art.tsx', 'apps/web/src/components/lp/state-art.tsx']) {
    const component = await read(path);
    assert.match(component, /draggable=\{false\}/, path);
    assert.match(component, /onDragStart=\{\(event\) => event\.preventDefault\(\)\}/, path);
    assert.match(component, /alt=""/, path);
  }
  const css = (await read('src/app/globals.css')).replace(/\s+/g, ' ');
  const lpCss = (await read('apps/web/src/styles/lp.css')).replace(/\s+/g, ' ');
  for (const [name, source] of [['app', css], ['lp', lpCss]]) {
    const rule = source.match(/\.state-art \{([^}]*)\}/)?.[1] ?? '';
    for (const declaration of ['user-select: none', '-webkit-user-select: none', '-webkit-user-drag: none', 'pointer-events: none'])
      assert.ok(rule.includes(declaration), `${name}: ${declaration}`);
  }
});

test('cada estado mostra a sua ilustração', async () => {
  const where = {
    'src/components/dashboard.tsx': ['base-vazia', 'falha-consulta', 'sem-gastos'],
    'src/components/demo-pages.tsx': ['falha-consulta', 'sem-lancamentos', 'sem-cartoes', 'importar-extrato', 'sem-obrigacoes', 'nada-a-conciliar', 'sem-faturas', 'sem-patrimonio', 'sem-metas', 'sem-noticias', 'historico-vazio', 'perfil-vazio'],
    'src/components/overlays.tsx': ['sem-notificacoes', 'sem-contas', 'importar-extrato'],
    'src/app/not-found.tsx': ['nao-encontrada'],
    'src/app/error.tsx': ['erro-tela'],
    'apps/web/src/app/not-found.tsx': ['nao-encontrada'],
    'apps/web/src/app/error.tsx': ['erro-tela'],
    'apps/web/src/app/downloads/page.tsx': ['sem-versoes'],
  };
  const used = new Set();
  for (const [path, keys] of Object.entries(where)) {
    const source = await read(path);
    for (const key of keys) {
      assert.match(source, new RegExp(`(art|name)=["{]?'?"?${key}`), `${path} sem ${key}`);
      used.add(key);
    }
  }
  for (const key of KEYS) assert.ok(used.has(key), `chave sem uso: ${key}`);
});

test('a ilustração se integra ao fundo onde aparece, nos dois temas', async () => {
  // A placa #F4F1EA aparecia como um quadrado sobre o cartão #FFFDF8, e no
  // escuro o desenho perdia contraste. Cada tema recebe o papel na cor exata
  // da sua superfície, sem placa.
  for (const key of KEYS) {
    for (const tema of ['claro', 'escuro']) {
      const svg = (await read(`public/estados/${tema}/${key}.svg`)).toLowerCase();
      assert.doesNotMatch(svg, /<rect /, `${tema}/${key} ainda tem placa`);
      assert.doesNotMatch(svg, /#f4f1ea/, `${tema}/${key} usa o papel antigo`);
    }
  }
  for (const key of LP_KEYS) assert.doesNotMatch(await read(`apps/web/public/estados/${key}.svg`), /<rect /, key);
});

test('o app mostra a variante do tema ativo', async () => {
  const component = await read('src/components/state-art.tsx');
  assert.match(component, /\/estados\/claro\/\$\{name\}\.svg/);
  assert.match(component, /\/estados\/escuro\/\$\{name\}\.svg/);
  const css = (await read('src/app/globals.css')).replace(/\s+/g, ' ');
  assert.match(css, /\.state-art-escuro \{[^}]*display: none/);
  assert.match(css, /html\.dark \.state-art-claro \{[^}]*display: none/);
  assert.match(css, /html\.dark \.state-art-escuro \{[^}]*display: block/);
});

test('os mestres vetoriais e o gerador das variantes estão versionados', async () => {
  const masters = (await files('design/estados-vetor/')).filter((name) => name.endsWith('.svg'));
  for (const key of [...KEYS, 'nova-versao']) assert.ok(masters.includes(`${key}.svg`), key);
  const { scripts } = JSON.parse(await read('package.json'));
  assert.equal(scripts['estados:gerar'], 'node scripts/gerar-estados.mjs');
});
