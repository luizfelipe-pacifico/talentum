import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito (teste manual, 20/11/2026): um duplo clique em "Salvar compromisso"
   criou dois compromissos iguais, e o painel passou a descontar a conta duas
   vezes. "Salvar fonte" (rendas previstas) tinha a mesma falha. O botão não
   travava durante o envio e POST /api/obligations e /api/incomes criavam uma
   linha nova a cada pedido.

   Regra (CLAUDE.md, toda escrita é idempotente): o formulário gera uma chave
   UUID por envio; o backend a exige e grava com restrição única por perfil, e
   o mesmo pedido repetido devolve o registro já criado (200) em vez de criar
   outro. O botão também fica desativado enquanto o envio está em andamento. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const schema = await read('prisma/schema.prisma');
const model = (name) => schema.slice(schema.indexOf(`model ${name} {`), schema.indexOf('\n}', schema.indexOf(`model ${name} {`)));

for (const [name, route] of [['ScheduledObligation', 'src/app/api/obligations/route.ts'], ['IncomeSource', 'src/app/api/incomes/route.ts']]) {
  test(`${name}: a chave de idempotência é única por perfil`, () => {
    const body = model(name);
    assert.match(body, /idempotencyKey\s+String\?/);
    assert.match(body, /@@unique\(\[profileId, idempotencyKey\]\)/);
  });

  test(`${route}: exige a chave e devolve o registro existente no reenvio`, async () => {
    const source = await read(route);
    const post = source.slice(source.indexOf('export async function POST'));
    assert.match(source, /idempotencyKey: z\.string\(\)\.uuid\(\)/);
    const lookup = post.search(/findFirst\(\{ where: \{ profileId: guarded\.profileId, idempotencyKey/);
    assert.ok(lookup > 0, 'procura o envio anterior pela chave');
    assert.ok(lookup < post.search(/\.create\(/), 'antes de criar');
    assert.match(post, /P2002/, 'a corrida entre dois pedidos simultâneos cai na restrição única e devolve o vencedor');
  });
}

test('os formulários enviam uma chave por envio e travam o botão', async () => {
  const source = await read('src/components/financial-planning.tsx');
  for (const page of ['ObligationsPage', 'IncomesPage', 'CategoriesPage']) {
    const start = source.indexOf(`export function ${page}(`);
    const code = source.slice(start, source.indexOf('\nexport function ', start + 1) === -1 ? undefined : source.indexOf('\nexport function ', start + 1));
    assert.match(code, /disabled=\{busy\}/, `${page}: botão não trava`);
    if (page !== 'CategoriesPage') assert.match(code, /idempotencyKey/, `${page}: envio sem chave`);
  }
});
