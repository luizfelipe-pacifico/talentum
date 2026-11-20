import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/* Contratos do Stage 8 (cartões, faturas, benefícios) e do leitor de PDF,
   verificados no código-fonte. O comportamento das regras está em
   tests/cards.test.mjs e tests/import-pdf.test.mjs. */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const MIGRATION = 'prisma/migrations/20261120200000_cards_statements/migration.sql';

test('a migration cria as tabelas com id opaco, chaves estrangeiras e dinheiro em centavos', async () => {
  const sql = await read(MIGRATION);
  for (const table of ['CreditCard', 'CardStatement', 'CardStatementItem', 'CardStatementPayment', 'CardBenefit']) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}" \\(\\s*"id" TEXT NOT NULL PRIMARY KEY`), table);
    assert.match(sql, new RegExp(`CONSTRAINT "${table}_profileId_fkey" FOREIGN KEY \\("profileId"\\)`), `${table} por perfil`);
  }
  for (const money of ['"limitCents" BIGINT', '"annualFeeCents" BIGINT', '"totalCents" BIGINT NOT NULL', '"amountCents" BIGINT NOT NULL']) {
    assert.ok(sql.includes(money), money);
  }
  // Idempotência garantida pelo banco, não só pela tela.
  for (const unique of [
    'CreditCard_profileId_name_key',
    'CardStatement_creditCardId_dueDate_key',
    'CardStatementItem_cardStatementId_externalId_key',
    'CardStatementPayment_transactionId_key',
    'CardBenefit_creditCardId_kind_programName_key',
  ]) {
    assert.ok(sql.includes(`CREATE UNIQUE INDEX "${unique}"`), unique);
  }
  assert.match(sql, /ALTER TABLE "ImportBatch" ADD COLUMN "parser" TEXT;/);
  assert.doesNotMatch(sql, /DROP |DELETE FROM/, 'a migration só acrescenta');
});

test('o cartão nunca guarda número completo, código de segurança ou senha', async () => {
  const schema = await read('prisma/schema.prisma');
  const model = schema.slice(schema.indexOf('model CreditCard {'), schema.indexOf('model CardStatement {'));
  assert.match(model, /lastFourDigits\s+String\?/);
  assert.doesNotMatch(model, /cardNumber|\bpan\b|cvv|cvc|password|senha/i);
  const store = await read('src/server/card-store.ts');
  assert.match(store, /lastFourDigits: z\.string\(\)\.regex\(\/\^\\d\{4\}\$\/\)/);
});

test('toda rota de cartão exige código de ação, perfil e valida a entrada com zod', async () => {
  const dirs = ['cards', 'card-statements', 'card-benefits', 'card-statement-checks'];
  const routes = [];
  for (const dir of dirs) {
    for (const entry of await readdir(new URL(`src/app/api/${dir}/`, root), { recursive: true })) {
      if (entry.endsWith('route.ts')) routes.push(`src/app/api/${dir}/${entry.replaceAll('\\', '/')}`);
    }
  }
  assert.ok(routes.length >= 11, `rotas encontradas: ${routes.length}`);
  for (const route of routes) {
    const source = await read(route);
    const handlers = [...source.matchAll(/export async function (GET|POST|PATCH|DELETE)\b[\s\S]*?(?=\nexport |$)/g)];
    for (const [body, method] of handlers) assert.match(body, /guardWithProfile\(request\)/, `${route} ${method}`);
    if (/export async function (POST|PATCH)/.test(source) && !route.includes('/items/import/')) {
      assert.match(source, /Schema\.safeParse\(await readJson\(request\)\)/, `${route}: validação`);
    }
    assert.doesNotMatch(source, /error\.stack|String\(error\)|error\.message/, `${route}: sem detalhe interno na resposta`);
  }
});

test('o pagamento conciliado é revalidado no backend e grava a situação na mesma transação', async () => {
  const source = await read('src/app/api/card-statements/[statementId]/payments/route.ts');
  assert.match(source, /transaction\.amountCents >= 0n/);
  assert.match(source, /TRANSACTION_ALREADY_LINKED/);
  assert.match(source, /PAYMENT_EXCEEDS_OUTSTANDING/);
  assert.match(source, /db\.\$transaction[\s\S]*refreshStatementStatus\(tx, statement\.id\)/);
});

test('o painel soma as faturas em aberto pela mesma função nas duas rotas', async () => {
  for (const route of ['src/app/api/dashboard/route.ts', 'src/app/api/dashboard/risk-free-balance/route.ts']) {
    const source = await read(route);
    assert.match(source, /loadOpenCardStatements\(/, route);
    assert.match(source, /cardStatementObligations\(/, route);
  }
});

test('as telas de cartão usam só a API local e substituem os placeholders', async () => {
  for (const file of ['src/components/cards.tsx', 'src/components/card-detail.tsx', 'src/components/invoice-check.tsx']) {
    const source = await read(file);
    assert.doesNotMatch(source, /@prisma|server\/db|demo-data|window\.confirm|window\.alert/, file);
  }
  assert.match(await read('src/app/extratos/cartoes/page.tsx'), /from '@\/components\/cards'/);
  assert.match(await read('src/app/extratos/cartoes/[cartaoId]/page.tsx'), /CardDetailPage cardId=\{cartaoId\}/);
  assert.match(await read('src/app/conciliacao/faturas/page.tsx'), /from '@\/components\/invoice-check'/);
  const detail = await read('src/components/card-detail.tsx');
  assert.match(detail, /clientKey: clientKey\.current/, 'item digitado leva chave de idempotência');
  assert.match(detail, /'\/api\/imports\/inspect'/, 'a prévia do arquivo não grava nada');
});

test('o importador aceita PDF pelo conteúdo nas três rotas que leem arquivo', async () => {
  for (const route of [
    'src/app/api/imports/inspect/route.ts',
    'src/app/api/imports/route.ts',
    'src/app/api/card-statements/[statementId]/items/import/route.ts',
  ]) {
    assert.match(await read(route), /await inspectStatementFile\(upload\.bytes/, route);
  }
  assert.match(await read('next.config.ts'), /serverExternalPackages: \['pdfjs-dist'\]/);
});
