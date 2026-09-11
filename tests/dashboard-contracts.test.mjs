import test from 'node:test'; import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url); const read=(path)=>readFile(new URL(path,root),'utf8');

test('as rotas do dashboard exigem código de ação de uso único',async()=>{
  for(const path of ['src/app/api/dashboard/route.ts','src/app/api/dashboard/categories/route.ts']){
    const source=await read(path);
    assert.match(source,/consumeActionCode\(request\.headers\.get\('X-Action-Code'\)/,path);
    assert.match(source,/INVALID_ACTION_CODE/,path);
    assert.match(source,/'Cache-Control': 'no-store'/,path);
  }
});

test('toda consulta do dashboard é escopada por perfil',async()=>{
  for(const path of ['src/app/api/dashboard/route.ts','src/app/api/dashboard/categories/route.ts']){
    const source=await read(path);
    assert.match(source,/getLocalProfileId\(\)/,path);
    // Nenhum `where` pode existir sem profileId: é a regra de isolamento da
    // seção 4 de docs/ESTRUTURA_DE_DADOS.md.
    for(const clause of source.match(/where:\s*\{[^}]*\}/g)??[])assert.match(clause,/profileId/,`${path}: ${clause}`);
  }
});

test('o contrato devolve centavos, nunca texto formatado',async()=>{
  const source=await read('src/app/api/dashboard/route.ts');
  assert.match(source,/Cents: cents\(/);
  assert.doesNotMatch(source,/Intl\.NumberFormat|R\$/);
});

test('o dashboard não devolve transação individual nem conteúdo de arquivo',async()=>{
  const source=await read('src/app/api/dashboard/route.ts');
  for(const leak of ['description: true','fileName','rows.map((row) => row)'])assert.ok(!source.includes(leak),leak);
});

test('sem perfil a API não inventa zeros',async()=>{
  const source=await read('src/app/api/dashboard/route.ts');
  assert.match(source,/if \(!profileId\)[\s\S]{0,160}hasProfile: false/);
});

test('o frontend nunca alcança Prisma nem o banco direto',async()=>{
  for(const path of ['src/components/dashboard.tsx','src/hooks/use-dashboard-data.ts','src/hooks/use-category-breakdown.ts','src/lib/api-client.ts']){
    const source=await read(path);
    assert.doesNotMatch(source,/@prisma|server\/db|PrismaClient|sqlite/i,path);
  }
});

test('a interface não renderiza número sem estado pronto',async()=>{
  const hook=await read('src/hooks/use-dashboard-data.ts');
  assert.doesNotMatch(hook,/R\$ 0,00|balance: '0'/);           // sem valor padrão
  assert.match(hook,/status: 'loading'|status: 'error'|status: 'ready'/);
  const view=await read('src/components/dashboard.tsx');
  assert.match(view,/status === 'loading'[\s\S]{0,80}Skeleton/);
  assert.match(view,/status === 'error'[\s\S]{0,80}ErrorState/);
});

test('a migration de obrigações traz id opaco, chaves estrangeiras e status',async()=>{
  const sql=await read('prisma/migrations/20260911000729_mvp_scheduled_obligations/migration.sql');
  assert.match(sql,/CREATE TABLE "ScheduledObligation"/);
  assert.match(sql,/"id" TEXT NOT NULL PRIMARY KEY/);
  assert.match(sql,/"status" TEXT NOT NULL DEFAULT 'open'/);
  assert.match(sql,/"amountCents" BIGINT NOT NULL/);
  for(const fk of ['profileId','accountId','categoryId'])assert.match(sql,new RegExp(`FOREIGN KEY \\("${fk}"\\)`),fk);
  assert.match(sql,/CREATE INDEX "ScheduledObligation_profileId_status_dueDate_idx"/);
});

test('as migrations já aplicadas não foram reescritas',async()=>{
  const init=await read('prisma/migrations/20260905182000_init/migration.sql');
  const core=await read('prisma/migrations/20260905214010_mvp_financial_core/migration.sql');
  assert.doesNotMatch(init,/ScheduledObligation/);
  assert.doesNotMatch(core,/ScheduledObligation/);
});
