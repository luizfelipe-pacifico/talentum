import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

/* Contratos de orçamento, metas, dívidas e patrimônio (Stages 9, 12, 13 e 14). */

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const ROUTES = [
  'budgets/route.ts',
  'budgets/[budgetId]/route.ts',
  'budgets/copy/route.ts',
  'goals/route.ts',
  'goals/[goalId]/route.ts',
  'goals/[goalId]/contributions/route.ts',
  'goals/[goalId]/contributions/[contributionId]/route.ts',
  'goals/surplus-allocation/route.ts',
  'debts/route.ts',
  'debts/[debtId]/route.ts',
  'debts/payoff-plan/route.ts',
  'survival/route.ts',
  'assets/route.ts',
  'assets/[assetId]/route.ts',
  'assets/[assetId]/snapshots/route.ts',
  'portfolio/route.ts',
  'portfolio/contribution-simulation/route.ts',
];

test('migração cria as tabelas novas com id opaco e chaves estrangeiras', async () => {
  const sql = await read('prisma/migrations/20261120210000_planning_networth/migration.sql');
  for (const table of ['Budget', 'Goal', 'GoalContribution', 'Debt', 'Asset', 'AssetSnapshot']) {
    assert.match(sql, new RegExp(`CREATE TABLE "${table}" \\("id" TEXT NOT NULL PRIMARY KEY`), table);
    assert.match(sql, new RegExp(`CONSTRAINT "${table}_profileId_fkey" FOREIGN KEY \\("profileId"\\)`), table);
  }
  assert.match(sql, /ALTER TABLE "Category" ADD COLUMN "isEssential"/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|DELETE FROM/, 'migração aditiva');
  // Dinheiro em centavos inteiros e taxa em pontos-base inteiros.
  assert.doesNotMatch(sql, /REAL|DECIMAL|FLOAT/);
  assert.match(sql, /"monthlyRateBps" INTEGER NOT NULL/);
  // Idempotência por chave única no escopo do perfil.
  assert.match(sql, /UNIQUE INDEX "GoalContribution_profileId_idempotencyKey_key"/);
  assert.match(sql, /UNIQUE INDEX "AssetSnapshot_profileId_idempotencyKey_key"/);
  assert.match(sql, /UNIQUE INDEX "Budget_profileId_categoryId_month_key"/);
});

test('toda rota nova exige código de ação, perfil e entrada estrita', async () => {
  const existing = (await readdir(new URL('src/app/api/', root), { recursive: true })).map((entry) => entry.replaceAll('\\', '/'));
  for (const route of ROUTES) {
    assert.ok(existing.includes(route), `${route} existe`);
    const source = await read(`src/app/api/${route}`);
    assert.match(source, /guardWithProfile\(request\)/, route);
    assert.match(source, /profileId/, route);
    if (/z\.object\(/.test(source)) assert.match(source, /\.strict\(\)/, `${route}: schema estrito`);
    assert.doesNotMatch(source, /Intl\.NumberFormat|toLocaleString/, `${route}: backend não formata dinheiro`);
  }
});

test('escritas repetíveis usam chave de idempotência e tratam corrida', async () => {
  for (const route of ['goals/[goalId]/contributions/route.ts', 'assets/route.ts', 'assets/[assetId]/snapshots/route.ts']) {
    const source = await read(`src/app/api/${route}`);
    assert.match(source, /idempotencyKey/, route);
    assert.match(source, /isUniqueViolation\(error\)/, route);
    assert.match(source, /replayed: true/, route);
  }
  const budgets = await read('src/app/api/budgets/route.ts');
  assert.match(budgets, /upsert/);
  assert.match(budgets, /isUniqueViolation/);
});

test('retirada de meta não deixa saldo negativo: conferência depois da escrita, dentro da transação', async () => {
  const source = await read('src/app/api/goals/[goalId]/contributions/route.ts');
  assert.match(source, /\$transaction[\s\S]*goalContribution\.create[\s\S]*savedCents\([\s\S]*< 0n[\s\S]*OverdrawnError/);
});

test('simulação de aporte confere o modo sobrevivência antes de distribuir', async () => {
  const source = await read('src/app/api/portfolio/contribution-simulation/route.ts');
  assert.match(source, /if \(survival\.active\)[\s\S]*status: 'survival'[\s\S]*simulateContribution/);
});

test('eventos de linha do tempo das novas rotas não carregam valor nem nome digitado', async () => {
  for (const route of ROUTES) {
    const source = await read(`src/app/api/${route}`);
    for (const call of source.match(/planningEvent\([^)]*\)/g) ?? []) {
      assert.doesNotMatch(call, /parsed\.data\.(name|amountCents|valueCents|targetCents)|\$\{/, `${route}: ${call}`);
    }
  }
});

test('telas usam só a API local e trazem os avisos obrigatórios', async () => {
  const files = ['budget', 'goals', 'debts', 'net-worth', 'planning-ui'];
  for (const file of files) {
    const source = await read(`src/components/${file}.tsx`);
    assert.doesNotMatch(source, /demo-data|@prisma|server\/db/, file);
  }
  const netWorth = await read('src/components/net-worth.tsx');
  assert.match(netWorth, /metodologia ARCA, criada por Thiago Nigro/, 'atribuição da metodologia');
  assert.match(netWorth, /não recomenda produto, compra ou venda/, 'aviso de não recomendação');
  const debts = await read('src/components/debts.tsx');
  assert.match(debts, /Nada aqui é orientação jurídica ou financeira individual/);
  const budget = await read('src/components/budget.tsx');
  assert.match(budget, /Nada aqui é recomendação financeira/);
  const goals = await read('src/components/goals.tsx');
  assert.match(goals, /não indicam onde guardar o dinheiro nem qual investimento escolher/);
});

test('rotas de tela apontam para os componentes reais, não para os marcadores', async () => {
  const pages = {
    'src/app/patrimonio/page.tsx': 'NetWorthPage',
    'src/app/patrimonio/aportes/page.tsx': 'NextContributionPage',
    'src/app/patrimonio/metas/page.tsx': 'GoalsPage',
    'src/app/patrimonio/metas/[metaId]/page.tsx': 'GoalDetailPage',
    'src/app/planejamento/orcamento/page.tsx': 'BudgetPage',
    'src/app/planejamento/dividas/page.tsx': 'DebtsPage',
    'src/app/planejamento/sobrevivencia/page.tsx': 'SurvivalPage',
  };
  for (const [path, component] of Object.entries(pages)) {
    const source = await read(path);
    assert.match(source, new RegExp(component), path);
    assert.doesNotMatch(source, /demo-pages/, path);
  }
});

test('planejamento tem título, abas e item de navegação', async () => {
  const navigation = await import(new URL('src/lib/navigation.ts', root).href);
  assert.equal(navigation.pageMeta('/planejamento/rendas').title, 'Rendas previstas', 'rendas deixou de cair em página não encontrada');
  assert.equal(navigation.pageMeta('/planejamento/orcamento').title, 'Orçamento');
  assert.equal(navigation.activeTab('/planejamento/dividas'), '/planejamento/dividas');
  assert.equal(navigation.activeTab('/patrimonio/metas/abc'), '/patrimonio/metas');
  const data = await read('src/lib/demo-data.ts');
  assert.match(data, /href: '\/planejamento', icon: 'bi-calendar2-range', label: 'Planejamento'/);
});
