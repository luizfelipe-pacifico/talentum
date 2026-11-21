import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* Defeito: uma conta cadastrada como compromisso (ScheduledObligation) e também
   acompanhada como fatura de cartão (CardStatement) era descontada duas vezes
   do Saldo Livre de Risco. Exemplo sintético: "Fatura do cartão, R$ 1.200,
   vence dia 10" como compromisso e a fatura do mesmo cartão, com o mesmo
   vencimento, cadastrada no Stage 8: o comprometido somava R$ 2.400.

   Regra (docs/PRODUCT.md, V): um compromisso ligado a um cartão
   (`creditCardId`) deixa de pesar quando o mesmo cartão tem fatura não
   cancelada com vencimento no mesmo mês. A fatura é a fonte mais precisa:
   ela conhece o total e os pagamentos conciliados. */

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const metrics = await import(new URL('src/server/dashboard-metrics.ts', root).href);

/* Antes da correção a função não existia e as rotas somavam as duas listas
   inteiras; o fallback reproduz exatamente esse comportamento, para o teste
   falhar pelo valor descontado e não por um erro de importação. */
const withoutCovered = metrics.withoutBillsCoveredByStatements ?? ((obligations) => obligations);

const end = new Date(2026, 9, 31, 23, 59, 59, 999);
const due = new Date(2026, 9, 10, 12);

const bill = (overrides = {}) => ({
  amountCents: 120000n,
  dueDate: due,
  status: 'open',
  isEstimated: false,
  creditCardId: 'card-1',
  ...overrides,
});
const statement = (overrides = {}) => ({
  creditCardId: 'card-1',
  dueDate: new Date(2026, 9, 10),
  totalCents: 120000n,
  paidCents: 0n,
  status: 'open',
  isEstimated: false,
  ...overrides,
});

const committed = (obligations, statements) =>
  metrics.committedSummary([...withoutCovered(obligations, statements), ...metrics.cardStatementObligations(statements)], end);

test('a fatura de cartão também cadastrada como compromisso pesa uma vez só', () => {
  const summary = committed([bill()], [statement()]);
  assert.equal(summary.cents, 120000n, 'R$ 1.200 descontados uma vez, não R$ 2.400');
  assert.equal(summary.count, 1);
});

test('fatura paga cobre o compromisso do mesmo mês: a conta já saiu do saldo', () => {
  const summary = committed([bill()], [statement({ status: 'paid', paidCents: 120000n })]);
  assert.equal(summary.cents, 0n);
});

test('sem ligação explícita, ou com fatura de outro mês, cartão ou cancelada, o compromisso continua pesando', () => {
  assert.equal(committed([bill({ creditCardId: null })], [statement()]).cents, 240000n, 'sem ligação não há adivinhação');
  assert.equal(committed([bill()], [statement({ creditCardId: 'card-2' })]).cents, 240000n);
  assert.equal(committed([bill()], [statement({ dueDate: new Date(2026, 8, 10) })]).cents, 240000n, 'fatura de setembro não cobre outubro');
  assert.equal(committed([bill()], [statement({ status: 'cancelled' })]).cents, 120000n, 'fatura cancelada não cobre nada');
});

test('as três leituras do Saldo Livre de Risco usam a mesma lista sem duplicidade', async () => {
  const queries = await read('src/server/dashboard-queries.ts');
  assert.match(queries, /export async function loadCommittedObligations\(/);
  assert.match(queries, /withoutBillsCoveredByStatements\(/);
  for (const path of [
    'src/app/api/dashboard/route.ts',
    'src/app/api/dashboard/risk-free-balance/route.ts',
    'src/server/planning-queries.ts',
  ]) {
    assert.match(await read(path), /loadCommittedObligations\(/, path);
  }
});

test('o compromisso guarda a ligação com o cartão, sem apagar nada', async () => {
  const schema = await read('prisma/schema.prisma');
  const model = schema.slice(schema.indexOf('model ScheduledObligation {'), schema.indexOf('model TransactionRevision {'));
  assert.match(model, /creditCardId\s+String\?/);
  assert.match(model, /creditCard\s+CreditCard\?\s+@relation\(fields: \[creditCardId\], references: \[id\], onDelete: SetNull\)/);
  const sql = await read('prisma/migrations/20261120230000_obligation_credit_card/migration.sql');
  assert.match(sql, /ALTER TABLE "ScheduledObligation" ADD COLUMN "creditCardId" TEXT/);
  assert.doesNotMatch(sql, /DROP |DELETE FROM/);
  const api = await read('src/app/api/obligations/route.ts');
  assert.match(api, /creditCardId/);
  assert.match(api, /CARD_NOT_FOUND/, 'o cartão é conferido no perfil antes de gravar');
});
