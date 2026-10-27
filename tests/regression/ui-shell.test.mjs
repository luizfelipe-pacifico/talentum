import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/* Regressões encontradas no teste manual do shell do aplicativo local. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const nav = await import(new URL('src/lib/navigation.ts', root).href);

test('rota desconhecida não herda o título "Início"', () => {
  assert.equal(nav.pageMeta('/').title, 'Início');
  assert.equal(nav.pageMeta('/rota-inexistente').title, 'Página não encontrada');
  assert.equal(nav.pageMeta('/extratos/cartoes/aurora').title, 'Extratos e cartões');
});

test('a aba do pai fica ativa nas páginas de detalhe', () => {
  assert.equal(nav.activeTab('/extratos/cartoes/aurora'), '/extratos/cartoes');
  assert.equal(nav.activeTab('/extratos/cartoes'), '/extratos/cartoes');
  assert.equal(nav.activeTab('/extratos'), '/extratos');
  assert.equal(nav.activeTab('/patrimonio/metas/viagem'), '/patrimonio/metas');
  assert.equal(nav.activeTab('/dashboard'), null);
});

test('abas de navegação são links com aria-current, não role="tab" sem teclado', async () => {
  const shell = await read('src/components/app-shell.tsx');
  assert.doesNotMatch(shell, /role="tab"/);
  assert.match(shell, /aria-current=\{activeTab === tab\.href \? 'page' : undefined\}/);
});

test('todo controle da sidebar tem nome acessível também recolhida', async () => {
  const shell = await read('src/components/app-shell.tsx');
  assert.match(shell, /className="sidebar-account"[\s\S]{0,200}aria-label="Conta ativa: Todas as contas"/);
  assert.match(shell, /className="nav-item"[\s\S]{0,200}aria-label=\{item\.label\}/);
  assert.match(shell, /className="sidebar-import"[^>]*aria-label="Importação rápida"/);
  assert.match(shell, /className="sidebar-quiet"[^>]*aria-label="Configurações"/);
});

test('o foco entra no diálogo, fica preso nele e volta ao gatilho', async () => {
  const focus = await import(new URL('src/lib/focus-trap.ts', root).href);
  // Tab no último volta ao primeiro; Shift+Tab no primeiro vai ao último.
  assert.equal(focus.nextFocusIndex(2, 3, false), 0);
  assert.equal(focus.nextFocusIndex(0, 3, true), 2);
  assert.equal(focus.nextFocusIndex(1, 3, false), 2);
  assert.equal(focus.nextFocusIndex(-1, 3, false), 0);
  const overlays = await read('src/components/overlays.tsx');
  const dialogs = overlays.match(/role="dialog"/g) ?? [];
  const trapped = overlays.match(/ref=\{trapRef\}/g) ?? [];
  assert.ok(dialogs.length > 0);
  assert.equal(trapped.length, dialogs.length, 'cada diálogo, inclusive a gaveta, prende o foco');
});

test('o tema salvo é aplicado antes da primeira pintura (sem clarão)', async () => {
  const layout = await read('src/app/layout.tsx');
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /talentum:tema/);
  assert.match(layout, /dangerouslySetInnerHTML=\{\{ __html: THEME_BOOTSTRAP \}\}/);
});

test('a interface não cita documentação interna', async () => {
  // CLAUDE.md: nunca renderizar documentação interna na interface.
  const files = [];
  for (const dir of ['src/components', 'src/app']) {
    for (const entry of await readdir(new URL(`${dir}/`, root), { recursive: true }))
      if (entry.endsWith('.tsx')) files.push(`${dir}/${entry.replaceAll('\\', '/')}`);
  }
  for (const file of files) {
    const source = (await read(file)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    assert.doesNotMatch(source, /Routing MVP|ROUTING_MVP|docs\/[A-Z_-]+\.md/, file);
  }
});

test('o guia de layout interno só existe em desenvolvimento', async () => {
  const page = await read('src/app/layout-guide/page.tsx');
  assert.match(page, /process\.env\.NODE_ENV !== 'development'[\s\S]{0,40}notFound\(\)/);
  const settings = await read('src/components/demo-pages.tsx');
  assert.match(settings, /process\.env\.NODE_ENV === 'development' && <Link className="btn-link" href="\/layout-guide">/);
});
