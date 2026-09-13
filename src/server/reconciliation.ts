import { Prisma } from '@prisma/client';
import { db } from '@/server/db';

type TransactionSnapshot = { entity:'transaction'; transactionId:string; categoryId:string|null; amountCents:string; status:string };
type ObligationSnapshot = { entity:'obligation'; obligationId:string; status:string };
type Snapshot = TransactionSnapshot | ObligationSnapshot;

export class ReconciliationError extends Error {
  constructor(readonly code: 'ITEM_NOT_FOUND'|'CATEGORY_NOT_FOUND'|'COUNTERPART_NOT_FOUND'|'INVALID_TRANSFER'|'DECISION_NOT_FOUND'|'DECISION_REVERTED') { super(code); }
}

const snapshot = (row: { id:string; categoryId:string|null; amountCents:bigint; status:string }): Snapshot => ({
  entity:'transaction', transactionId: row.id, categoryId: row.categoryId, amountCents: row.amountCents.toString(), status: row.status,
});

export type DecisionInput =
  | { kind:'confirm' }
  | { kind:'category'; categoryId:string }
  | { kind:'obligation'; obligationId:string }
  | { kind:'adjustment'; adjustedAmountCents:string; adjustmentKind:'interest'|'fee'|'discount'|'correction'; note?:string }
  | { kind:'transfer'; counterpartTransactionId:string; categoryId:string };

export async function decide(profileId:string, itemId:string, input:DecisionInput) {
  return db.$transaction(async (tx) => {
    const item=await tx.reconciliationItem.findFirst({where:{id:itemId,profileId,status:'pending'},include:{transaction:true}});
    if(!item) throw new ReconciliationError('ITEM_NOT_FOUND');
    const before:Snapshot[]=[snapshot(item.transaction)];
    let after:Snapshot[];

    if(input.kind==='category' || input.kind==='transfer') {
      const category=await tx.category.findFirst({where:{id:input.categoryId,profileId},select:{id:true,kind:true}});
      if(!category) throw new ReconciliationError('CATEGORY_NOT_FOUND');
      if(input.kind==='transfer' && category.kind!=='transfer') throw new ReconciliationError('INVALID_TRANSFER');
    }

    if(input.kind==='transfer') {
      const counterpart=await tx.transaction.findFirst({where:{id:input.counterpartTransactionId,profileId},select:{id:true,accountId:true,categoryId:true,amountCents:true,status:true}});
      if(!counterpart) throw new ReconciliationError('COUNTERPART_NOT_FOUND');
      if(counterpart.id===item.transactionId || counterpart.accountId===item.transaction.accountId || (counterpart.amountCents < 0n)===(item.transaction.amountCents < 0n) || counterpart.amountCents+item.transaction.amountCents!==0n) throw new ReconciliationError('INVALID_TRANSFER');
      before.push(snapshot(counterpart));
      const [outgoing,incoming]=item.transaction.amountCents<0n?[item.transaction.id,counterpart.id]:[counterpart.id,item.transaction.id];
      await tx.transaction.updateMany({where:{id:{in:[item.transaction.id,counterpart.id]},profileId},data:{categoryId:input.categoryId,status:'posted'}});
      after=before.map((value)=>({...value,categoryId:input.categoryId,status:'posted'}));
      const decision=await tx.reconciliationDecision.create({data:{profileId,reconciliationItemId:item.id,kind:input.kind,beforeJson:JSON.stringify(before),afterJson:JSON.stringify(after)}});
      await tx.ownAccountTransfer.create({data:{profileId,outgoingTransactionId:outgoing,incomingTransactionId:incoming,decisionId:decision.id}});
      await tx.reconciliationItem.updateMany({where:{profileId,transactionId:{in:[item.transaction.id,counterpart.id]}},data:{status:'resolved'}});
      await tx.timelineEvent.create({data:{profileId,kind:'reconciliation',title:'Transferência conciliada',description:'Dois lançamentos entre contas próprias foram pareados.',transactionId:item.transactionId,reconciliationDecisionId:decision.id,reversible:true}});
      return {decisionId:decision.id};
    }

    if(input.kind==='obligation') {
      const obligation=await tx.scheduledObligation.findFirst({where:{id:input.obligationId,profileId},select:{id:true,status:true}});
      if(!obligation) throw new ReconciliationError('COUNTERPART_NOT_FOUND');
      before.push({entity:'obligation',obligationId:obligation.id,status:obligation.status});
      await tx.transaction.update({where:{id:item.transactionId},data:{status:'posted'}});
      await tx.scheduledObligation.update({where:{id:obligation.id},data:{status:'paid'}});
      const after:Snapshot[]=[{...snapshot(item.transaction),status:'posted'},{entity:'obligation',obligationId:obligation.id,status:'paid'}];
      const decision=await tx.reconciliationDecision.create({data:{profileId,reconciliationItemId:item.id,kind:input.kind,beforeJson:JSON.stringify(before),afterJson:JSON.stringify(after)}});
      await tx.reconciliationItem.update({where:{id:item.id},data:{status:'resolved'}});
      await tx.timelineEvent.create({data:{profileId,kind:'reconciliation',title:'Compromisso conciliado',description:'Um lançamento foi associado a um compromisso.',transactionId:item.transactionId,reconciliationDecisionId:decision.id,reversible:true}});
      return {decisionId:decision.id};
    }

    const data:Prisma.TransactionUpdateInput={status:'posted'};
    if(input.kind==='category') data.category={connect:{id:input.categoryId}};
    if(input.kind==='adjustment') data.amountCents=BigInt(input.adjustedAmountCents);
    await tx.transaction.update({where:{id:item.transactionId},data});
    const original=before[0] as TransactionSnapshot;
    after=[{...original,status:'posted',categoryId:input.kind==='category'?input.categoryId:original.categoryId,amountCents:input.kind==='adjustment'?input.adjustedAmountCents:original.amountCents}];
    const decision=await tx.reconciliationDecision.create({data:{profileId,reconciliationItemId:item.id,kind:input.kind,beforeJson:JSON.stringify(before),afterJson:JSON.stringify(after)}});
    if(input.kind==='adjustment') await tx.financialAdjustment.create({data:{profileId,transactionId:item.transactionId,decisionId:decision.id,kind:input.adjustmentKind,deltaCents:BigInt(input.adjustedAmountCents)-item.transaction.amountCents,note:input.note??null}});
    await tx.reconciliationItem.update({where:{id:item.id},data:{status:'resolved'}});
    await tx.timelineEvent.create({data:{profileId,kind:'reconciliation',title:'Lançamento conciliado',description:`Decisão aplicada: ${input.kind}.`,transactionId:item.transactionId,reconciliationDecisionId:decision.id,reversible:true}});
    return {decisionId:decision.id};
  });
}

export async function revertDecision(profileId:string, decisionId:string) {
  return db.$transaction(async(tx)=>{
    const decision=await tx.reconciliationDecision.findFirst({where:{id:decisionId,profileId},select:{id:true,reconciliationItemId:true,beforeJson:true,revertedAt:true}});
    if(!decision) throw new ReconciliationError('DECISION_NOT_FOUND');
    if(decision.revertedAt) throw new ReconciliationError('DECISION_REVERTED');
    const before=JSON.parse(decision.beforeJson) as Snapshot[];
    for(const value of before) {
      if(value.entity==='transaction') await tx.transaction.updateMany({where:{id:value.transactionId,profileId},data:{categoryId:value.categoryId,amountCents:BigInt(value.amountCents),status:value.status}});
      else await tx.scheduledObligation.updateMany({where:{id:value.obligationId,profileId},data:{status:value.status}});
    }
    await tx.financialAdjustment.deleteMany({where:{decisionId:decision.id,profileId}});
    await tx.ownAccountTransfer.deleteMany({where:{decisionId:decision.id,profileId}});
    await tx.reconciliationDecision.update({where:{id:decision.id},data:{revertedAt:new Date()}});
    await tx.timelineEvent.updateMany({where:{profileId,reconciliationDecisionId:decision.id,revertedAt:null},data:{revertedAt:new Date(),reversible:false}});
    await tx.reconciliationItem.updateMany({where:{profileId,transactionId:{in:before.filter((value):value is TransactionSnapshot=>value.entity==='transaction').map(value=>value.transactionId)}},data:{status:'pending'}});
    return {reverted:true};
  });
}
