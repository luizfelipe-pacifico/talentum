import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url); const read=(path)=>readFile(new URL(path,root),'utf8');

test('planejamento financeiro nasce em migration relacional',async()=>{
  const sql=await read('prisma/migrations/20260912200000_mvp_income_merchant_rules/migration.sql');
  for(const table of ['IncomeSource','MerchantRule'])assert.match(sql,new RegExp(`CREATE TABLE "${table}"`));
  for(const fk of ['profileId','accountId','categoryId'])assert.match(sql,new RegExp(`FOREIGN KEY \\(\\"${fk}\\"\\)`));
});

test('categorias, rendas, obrigações e regras exigem proteção e perfil',async()=>{
  for(const path of ['src/app/api/categories/route.ts','src/app/api/categories/[categoryId]/route.ts','src/app/api/incomes/route.ts','src/app/api/obligations/route.ts','src/app/api/obligations/[obligationId]/route.ts','src/app/api/merchant-rules/route.ts']){
    const source=await read(path);assert.match(source,/guardWithProfile/,path);assert.match(source,/profileId: guarded\.profileId/,path);
  }
});

test('dinheiro cru permanece em centavos no backend',async()=>{
  for(const path of ['src/app/api/incomes/route.ts','src/app/api/obligations/route.ts']){
    const source=await read(path);assert.match(source,/amountCents/);assert.doesNotMatch(source,/Intl\.NumberFormat|toLocaleString/,path);
  }
});

test('as três telas usam dados das APIs locais',async()=>{
  const source=await read('src/components/financial-planning.tsx');
  for(const route of ['/api/categories','/api/incomes','/api/obligations'])assert.ok(source.includes(route),route);
  assert.doesNotMatch(source,/demo-data|@prisma|server\/db/);
});
