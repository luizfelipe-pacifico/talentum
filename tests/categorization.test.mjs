import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { categorize, normalizeForMatch, proposedPattern, ruleMatches } from '../src/server/categorization.ts';
import { planReconciliation } from '../src/server/reconciliation-plan.ts';

/* Categorização automática e plano de conciliação (Feature 6 de docs/PRODUCT.md).
   Todas as descrições e regras são sintéticas. */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const rule = (over) => ({ id: 'r1', categoryId: 'c-mercado', pattern: 'mercado sintetico', matchType: 'startsWith', priority: 0, ...over });

test('a comparação ignora acento, caixa e espaço repetido', () => {
  assert.equal(normalizeForMatch('  MERCADO   Sintético  '), 'mercado sintetico');
  assert.equal(ruleMatches('MERCADO SINTÉTICO LOJA 12', rule({})), true);
  assert.equal(ruleMatches('PADARIA MERCADO SINTETICO', rule({})), false, 'começa com não casa no meio');
  assert.equal(ruleMatches('padaria mercado sintetico', rule({ matchType: 'contains' })), true);
  assert.equal(ruleMatches('mercado sintetico', rule({ matchType: 'exact' })), true);
  assert.equal(ruleMatches('mercado sintetico 2', rule({ matchType: 'exact' })), false);
});

test('igual a e começa com são aplicadas; contém vira sugestão', () => {
  assert.deepEqual(categorize('MERCADO SINTETICO 01', [rule({})]), { kind: 'apply', categoryId: 'c-mercado', ruleId: 'r1', confidence: 90, reason: 'merchant_rule' });
  assert.equal(categorize('mercado sintetico', [rule({ matchType: 'exact' })]).confidence, 100);
  const suggestion = categorize('COMPRA MERCADO SINTETICO', [rule({ matchType: 'contains' })]);
  assert.equal(suggestion.kind, 'suggest');
  assert.equal(suggestion.reason, 'merchant_rule_suggestion');
  assert.equal(categorize('farmacia sintetica', [rule({})]).kind, 'none');
});

test('prioridade e especificidade decidem; empate real entre categorias é conflito', () => {
  const broad = rule({ id: 'amplo', categoryId: 'c-geral', pattern: 'mercado', matchType: 'startsWith' });
  const exact = rule({ id: 'exato', categoryId: 'c-mercado', pattern: 'mercado sintetico', matchType: 'exact' });
  assert.equal(categorize('mercado sintetico', [broad, exact]).ruleId, 'exato', 'a forma mais específica vence');
  assert.equal(categorize('mercado sintetico', [exact, rule({ id: 'alta', categoryId: 'c-alta', pattern: 'mercado', priority: 10 })]).ruleId, 'alta', 'prioridade maior vence');
  const twin = rule({ id: 'gemea', categoryId: 'c-outra' });
  assert.deepEqual(categorize('mercado sintetico 9', [rule({}), twin]), { kind: 'conflict', confidence: 0, reason: 'merchant_rule_conflict' });
  assert.equal(categorize('mercado sintetico 9', [rule({}), rule({ id: 'mesma' })]).kind, 'apply', 'duas regras para a mesma categoria não conflitam');
});

test('o padrão proposto para uma regra nova ignora números e fica curto', () => {
  assert.equal(proposedPattern('MERCADO SINTÉTICO 1234 SAO PAULO'), 'mercado sintetico');
  assert.equal(proposedPattern('12/09 PADARIA'), 'padaria');
});

test('o plano trata transferência provável antes de qualquer regra', () => {
  const day = new Date(2026, 8, 10);
  const entries = [
    { id: 'saida', accountId: 'conta-a', occurredOn: day, amountCents: -50_000n, description: 'MERCADO SINTETICO TRANSF' },
    { id: 'compra', accountId: 'conta-a', occurredOn: day, amountCents: -1_234n, description: 'MERCADO SINTETICO 01' },
    { id: 'outra', accountId: 'conta-a', occurredOn: day, amountCents: -999n, description: 'FARMACIA SINTETICA' },
  ];
  const pool = [{ id: 'entrada', accountId: 'conta-b', occurredOn: new Date(2026, 8, 11), amountCents: 50_000n, pending: true }];
  const plan = planReconciliation(entries, pool, [rule({})]);
  const byId = Object.fromEntries(plan.entries.map((entry) => [entry.id, entry]));
  assert.equal(byId.saida.item.reason, 'own_transfer_candidate');
  assert.equal(byId.saida.categoryId, null, 'par provável não recebe categoria de gasto');
  assert.deepEqual(byId.compra.item, { status: 'resolved', reason: 'merchant_rule', confidence: 90 });
  assert.equal(byId.compra.categoryId, 'c-mercado');
  assert.deepEqual(byId.outra.item, { status: 'pending', reason: 'category_unknown', confidence: 0 });
  assert.deepEqual(plan.counterparts, [{ transactionId: 'entrada', confidence: 70 }]);
});

test('lançamento já decidido não serve de par provável', () => {
  const day = new Date(2026, 8, 10);
  const plan = planReconciliation(
    [{ id: 'saida', accountId: 'a', occurredOn: day, amountCents: -100n, description: 'X' }],
    [{ id: 'entrada', accountId: 'b', occurredOn: day, amountCents: 100n, pending: false }],
    [],
  );
  assert.equal(plan.entries[0].item.reason, 'category_unknown');
  assert.deepEqual(plan.counterparts, []);
});

test('a gravação é auditável, reversível e nunca sobrescreve categoria escolhida à mão', async () => {
  const persist = await read('src/server/import/persist.ts');
  assert.match(persist, /planNewEntries\(/);
  assert.match(persist, /writeReconciliation\(/);
  const auto = await read('src/server/auto-reconciliation.ts');
  // Toda regra aplicada gera uma decisão com antes e depois, revertida pelo caminho comum.
  assert.match(auto, /kind: 'rule', beforeJson: JSON\.stringify\(\[before\]\), afterJson: JSON\.stringify\(\[after\]\)/);
  // A reaplicação grava com a condição na própria escrita.
  assert.match(auto, /transaction\.updateMany\(\{ where: \{ id: item\.transaction\.id, profileId, categoryId: null \}/);
  assert.match(auto, /decisions: \{ none: \{ kind: 'rule' \} \}/, 'regra desfeita não volta sozinha');
  assert.match(auto, /transaction: \{ categoryId: null \}/);
  const reconciliation = await read('src/server/reconciliation.ts');
  assert.match(reconciliation, /decision\.kind==='rule'\?\{status:'pending',reason:'rule_reverted',confidence:0\}/);
});

test('as rotas de regras exigem código de ação e perfil', async () => {
  for (const path of ['src/app/api/merchant-rules/route.ts', 'src/app/api/merchant-rules/apply/route.ts', 'src/app/api/merchant-rules/[ruleId]/route.ts'])
    assert.match(await read(path), /guardWithProfile\(request\)/, path);
  const ui = await read('src/components/merchant-rules.tsx');
  assert.match(ui, /\/api\/merchant-rules\/apply/);
  assert.doesNotMatch(ui, /@prisma|server\/db/);
});
