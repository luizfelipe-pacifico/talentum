import test from 'node:test'; import assert from 'node:assert/strict';
import {divideRoundHalfUp,consolidatedBalance,expensesCents,incomeCents,dailyAverageCents,percentChange,committedCents,riskFreeBalanceCents,categoryBreakdown,monthToDate,previousMonthToDate,endOfMonth} from '../src/server/dashboard-metrics.ts';

const tx=(over={})=>({accountId:'a1',occurredOn:new Date('2026-09-10T12:00:00'),amountCents:-1000n,status:'settled',categoryId:null,categoryKind:'expense',...over});
const snap=(cents,iso)=>({balanceCents:cents,capturedAt:new Date(iso)});

test('arredonda meio para cima e preserva o sinal',()=>{
  assert.equal(divideRoundHalfUp(10n,4n),3n);          // 2,5 -> 3
  assert.equal(divideRoundHalfUp(9n,4n),2n);           // 2,25 -> 2
  assert.equal(divideRoundHalfUp(2n,4n),1n);           // 0,5 -> 1
  assert.equal(divideRoundHalfUp(-10n,4n),-3n);
  assert.equal(divideRoundHalfUp(0n,3n),0n);
  assert.throws(()=>divideRoundHalfUp(1n,0n),RangeError);
});

test('saldo soma os lançamentos posteriores ao snapshot e ignora os anteriores',()=>{
  const contas=[{accountId:'a1',snapshot:snap(100_00n,'2026-09-05T00:00:00')}];
  const lancamentos=[
    tx({occurredOn:new Date('2026-09-06T00:00:00'),amountCents:-30_00n}), // depois: entra
    tx({occurredOn:new Date('2026-09-01T00:00:00'),amountCents:-90_00n}), // antes: já refletido
  ];
  assert.equal(consolidatedBalance(contas,lancamentos).cents,70_00n);
});

test('conta sem snapshot é desconhecida, nunca zero',()=>{
  const resultado=consolidatedBalance([{accountId:'a1',snapshot:snap(50_00n,'2026-09-01T00:00:00')},{accountId:'a2',snapshot:null}],[]);
  assert.equal(resultado.cents,50_00n);
  assert.equal(resultado.knownAccounts,1);
  assert.equal(resultado.unknownAccounts,1);
});

test('saldo ignora lançamento pendente e lançamento de outra conta',()=>{
  const contas=[{accountId:'a1',snapshot:snap(0n,'2026-09-01T00:00:00')}];
  const lancamentos=[tx({amountCents:-10_00n,status:'pending'}),tx({accountId:'a2',amountCents:-99_00n})];
  assert.equal(consolidatedBalance(contas,lancamentos).cents,0n);
});

test('despesa exclui pendente e transferência própria',()=>{
  const lancamentos=[
    tx({amountCents:-10_00n}),
    tx({amountCents:-5_00n,status:'pending'}),
    tx({amountCents:-7_00n,categoryKind:'transfer'}),
    tx({amountCents:3_00n}),
  ];
  assert.equal(expensesCents(lancamentos),10_00n);
  assert.equal(incomeCents(lancamentos),3_00n);
});

test('média diária divide pelos dias decorridos e recusa período vazio',()=>{
  assert.equal(dailyAverageCents(100_00n,10),10_00n);
  assert.equal(dailyAverageCents(10n,4),3n);
  assert.throws(()=>dailyAverageCents(1n,0),RangeError);
});

test('variação percentual devolve null sem base de comparação',()=>{
  assert.equal(percentChange(120_00n,100_00n),20);
  assert.equal(percentChange(80_00n,100_00n),-20);
  assert.equal(percentChange(100_00n,0n),null);
  assert.equal(percentChange(0n,0n),null);
});

test('comprometido desconta só obrigação aberta dentro do período',()=>{
  const fim=new Date('2026-09-30T23:59:59.999');
  const obrigacoes=[
    {amountCents:50_00n,dueDate:new Date('2026-09-30T23:59:59.999'),status:'open'},  // limite: entra
    {amountCents:10_00n,dueDate:new Date('2026-10-01T00:00:00'),status:'open'},      // fora do período
    {amountCents:20_00n,dueDate:new Date('2026-09-15T00:00:00'),status:'paid'},      // já paga
    {amountCents:30_00n,dueDate:new Date('2026-09-15T00:00:00'),status:'cancelled'},
  ];
  assert.equal(committedCents(obrigacoes,fim),50_00n);
  assert.equal(riskFreeBalanceCents(200_00n,50_00n),150_00n);
});

test('sem obrigação o comprometido é zero confirmado',()=>{
  assert.equal(committedCents([],endOfMonth(new Date('2026-09-10T00:00:00'))),0n);
});

test('saldo livre de risco pode ficar negativo',()=>{
  assert.equal(riskFreeBalanceCents(10_00n,90_00n),-80_00n);
});

test('gastos por categoria preservam o não classificado e somam o total',()=>{
  const nomes=new Map([['c1','Alimentação'],['c2','Transporte']]);
  const lancamentos=[tx({categoryId:'c1',amountCents:-30_00n}),tx({categoryId:'c2',amountCents:-10_00n}),tx({categoryId:null,amountCents:-5_00n})];
  const {slices,totalCents}=categoryBreakdown(lancamentos,nomes);
  assert.equal(totalCents,45_00n);
  assert.deepEqual(slices.map(s=>s.name),['Alimentação','Transporte','Sem categoria']);
  assert.equal(slices.reduce((t,s)=>t+s.cents,0n),totalCents);
});

test('a cauda vira "Outros" sem perder centavos',()=>{
  const nomes=new Map(); const lancamentos=[];
  for(let i=0;i<10;i+=1){nomes.set(`c${i}`,`Categoria ${i}`);lancamentos.push(tx({categoryId:`c${i}`,amountCents:BigInt(-(10-i)*100)}));}
  const {slices,totalCents}=categoryBreakdown(lancamentos,nomes,7);
  assert.equal(slices.length,8);
  assert.equal(slices.at(-1).name,'Outros');
  assert.equal(slices.reduce((t,s)=>t+s.cents,0n),totalCents);
});

test('"Sem categoria" sobrevive ao corte mesmo sendo pequeno',()=>{
  const nomes=new Map(); const lancamentos=[];
  for(let i=0;i<9;i+=1){nomes.set(`c${i}`,`Categoria ${i}`);lancamentos.push(tx({categoryId:`c${i}`,amountCents:BigInt(-(20-i)*100)}));}
  lancamentos.push(tx({categoryId:null,amountCents:-1n}));   // o menor de todos
  const {slices,totalCents}=categoryBreakdown(lancamentos,nomes,7);
  assert.ok(slices.some(s=>s.name==='Sem categoria'),'sem categoria precisa continuar visivel');
  assert.equal(slices.at(-1).name,'Outros');
  assert.equal(slices.reduce((t,s)=>t+s.cents,0n),totalCents);
});

test('período corrente vai do dia 1 ao dia de referência',()=>{
  const {start,elapsedDays}=monthToDate(new Date('2026-09-12T15:00:00'));
  assert.equal(start.getDate(),1); assert.equal(start.getMonth(),8); assert.equal(elapsedDays,12);
});

test('o período anterior cobre o mesmo número de dias e trunca em mês mais curto',()=>{
  const igual=previousMonthToDate(new Date('2026-09-12T15:00:00'));
  assert.equal(igual.end.getMonth(),7); assert.equal(igual.elapsedDays,12);
  const curto=previousMonthToDate(new Date('2026-03-31T10:00:00')); // fevereiro de 2026 tem 28 dias
  assert.equal(curto.elapsedDays,28); assert.equal(curto.end.getDate(),28);
});

test('fim do período é o último instante do mês',()=>{
  const fim=endOfMonth(new Date('2026-02-10T00:00:00'));
  assert.equal(fim.getDate(),28); assert.equal(fim.getMonth(),1);
});
