import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Regressões do aplicativo local: fórmulas, scripts, Electron e fluxo de tipos. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const metrics = await import(new URL('src/server/dashboard-metrics.ts', root).href);

const tx = (amountCents, categoryId) => ({
  accountId: 'a1',
  occurredOn: new Date(2026, 9, 5),
  amountCents: BigInt(amountCents),
  status: 'confirmed',
  categoryId,
  categoryKind: 'expense',
});

test('categoria inexistente não cria uma segunda fatia "Sem categoria"', () => {
  // Nove categorias conhecidas, um lançamento sem categoria e um com ID órfão.
  const names = new Map(Array.from({ length: 9 }, (_, i) => [`c${i}`, `Categoria ${i}`]));
  const rows = [...names.keys()].map((id, i) => tx(-(1000 + i * 100), id));
  rows.push(tx(-50, null), tx(-40, 'categoria-apagada'));

  const { slices, totalCents } = metrics.categoryBreakdown(rows, names);
  const semCategoria = slices.filter((slice) => slice.name === 'Sem categoria');
  assert.equal(semCategoria.length, 1, 'existe uma única fatia "Sem categoria"');
  assert.equal(semCategoria[0].cents, 90n, 'o órfão soma no grupo sem categoria');
  assert.equal(slices.reduce((sum, slice) => sum + slice.cents, 0n), totalCents);
});

test('liberar a porta 3000 não encerra quem escuta na 30000', async () => {
  const { listeningPids } = await import(new URL('scripts/ports.mjs', root).href);
  const netstat = [
    '  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       111',
    '  TCP    0.0.0.0:30000          0.0.0.0:0              LISTENING       222',
    '  TCP    127.0.0.1:53000        127.0.0.1:3000         ESTABLISHED     333',
    '  TCP    [::1]:3000             [::]:0                 LISTENING       444',
  ].join('\r\n');
  assert.deepEqual([...listeningPids(netstat, 3000)].sort(), ['111', '444']);
});

test('typecheck gera o Prisma Client antes de checar os tipos', async () => {
  // Com o cliente desatualizado em relação ao schema, `tsc` acusava erros
  // falsos em src/app/api/dashboard/route.ts.
  const { scripts } = JSON.parse(await read('package.json'));
  assert.equal(scripts.typecheck, 'node scripts/typecheck.mjs');
  const script = await read('scripts/typecheck.mjs');
  assert.match(script, /if \(!clientIsCurrent\([\s\S]*'generate'[\s\S]*'--noEmit'/);
});

test('typecheck não regrava o Prisma Client já atualizado (DLL travada pelo dev)', async () => {
  // No Windows o servidor de desenvolvimento trava a DLL do Prisma: regenerar a
  // cada typecheck falhava com EPERM e o tsc nem chegava a rodar.
  const { clientIsCurrent } = await import(new URL('scripts/prisma-client.mjs', root).href);
  assert.equal(clientIsCurrent('model A {}\r\n', 'model A {}\n'), true);
  // O gerador reformata a cópia: alinhamento de colunas não é mudança de schema.
  assert.equal(clientIsCurrent('model A {\n  id String @id\n  nome String?\n}', 'model A {\n  id   String  @id\n  nome String?\n}'), true);
  assert.equal(clientIsCurrent('model A {}\nmodel B {}\n', 'model A {}\n'), false);
  assert.equal(clientIsCurrent('model A {}\n', null), false);
});

test('o Electron nega navegação e janelas fora do backend local', async () => {
  const main = await read('electron/main.cjs');
  assert.match(main, /setWindowOpenHandler\([\s\S]{0,200}action: 'deny'/);
  assert.match(main, /'will-navigate'[\s\S]{0,300}preventDefault\(\)/);
  assert.match(main, /setPermissionRequestHandler\([\s\S]{0,120}callback\(false\)/);
});

test('o preload só aceita IPC de janelas do próprio aplicativo', async () => {
  const main = await read('electron/main.cjs');
  assert.match(main, /function trustedSender\(/);
  for (const channel of ['window:minimize', 'window:toggle-maximize', 'window:close'])
    assert.match(main, new RegExp(`ipcMain\\.on\\('${channel}'[\\s\\S]{0,80}trustedSender`), channel);
});

test('a API local recusa Host que não seja o loopback (DNS rebinding)', async () => {
  const { isLoopbackHost } = await import(new URL('src/server/local-host.ts', root).href);
  for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'localhost'])
    assert.equal(isLoopbackHost(host), true, host);
  for (const host of ['ataque.example:3000', '127.0.0.1.ataque.example', null, ''])
    assert.equal(isLoopbackHost(host), false, String(host));
  assert.match(await read('src/middleware.ts'), /isLoopbackHost\(/);
});
