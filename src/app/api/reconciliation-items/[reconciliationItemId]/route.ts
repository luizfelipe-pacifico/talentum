import { db } from '@/server/db';
import { fail,guardWithProfile,isDenied,ok } from '@/server/http';
import { loadActiveRules,loadOwnPixIndexes,mentionsOwnPix } from '@/server/auto-reconciliation';
import { categorize,proposedPattern } from '@/server/categorization';
import { transferCandidates as rankTransfers } from '@/server/transfer-detection';

/* Um item da fila de conciliação, com o que a pessoa precisa para decidir.

   Sugestões são recalculadas a cada leitura, a partir das regras e chaves PIX
   atuais: nada fica guardado que possa envelhecer. A sugestão só propõe; quem
   escreve é a decisão que a pessoa confirma. */

export async function GET(request:Request,context:{params:Promise<{reconciliationItemId:string}>}){
 const guarded=await guardWithProfile(request);if(isDenied(guarded))return guarded.response;const {reconciliationItemId}=await context.params;
 const item=await db.reconciliationItem.findFirst({where:{id:reconciliationItemId,profileId:guarded.profileId},select:{id:true,reason:true,confidence:true,status:true,transaction:{select:{id:true,occurredOn:true,description:true,amountCents:true,status:true,category:{select:{id:true,name:true,kind:true}},account:{select:{id:true,name:true}}}},decisions:{orderBy:{createdAt:'desc'},select:{id:true,kind:true,createdAt:true,revertedAt:true}}}});
 if(!item)return fail('ITEM_NOT_FOUND','O item de conciliação não foi encontrado.',404);
 const [categories,obligations,counterparts,rules,indexes]=await Promise.all([
  db.category.findMany({where:{profileId:guarded.profileId},orderBy:{name:'asc'},select:{id:true,name:true,kind:true}}),
  db.scheduledObligation.findMany({where:{profileId:guarded.profileId,status:'open'},orderBy:{dueDate:'asc'},select:{id:true,description:true,amountCents:true,dueDate:true}}),
  db.transaction.findMany({where:{profileId:guarded.profileId,accountId:{not:item.transaction.account.id},amountCents:-item.transaction.amountCents,status:{in:['posted','pending']},outgoingTransfers:{none:{}},incomingTransfers:{none:{}}},orderBy:{occurredOn:'desc'},take:20,select:{id:true,occurredOn:true,description:true,amountCents:true,account:{select:{id:true,name:true}}}}),
  loadActiveRules(guarded.profileId),
  loadOwnPixIndexes(guarded.profileId),
 ]);

 // Pares prováveis primeiro: mesma quantia, sinal oposto, outra conta, data próxima
 // e, quando houver, a menção a uma chave PIX própria (src/server/transfer-detection.ts).
 const target={id:item.transaction.id,accountId:item.transaction.account.id,occurredOn:item.transaction.occurredOn,amountCents:item.transaction.amountCents,mentionsOwnPix:await mentionsOwnPix(item.transaction.description,indexes)};
 const pool=await Promise.all(counterparts.map(async candidate=>({id:candidate.id,accountId:candidate.account.id,occurredOn:candidate.occurredOn,amountCents:candidate.amountCents,mentionsOwnPix:await mentionsOwnPix(candidate.description,indexes)})));
 const ranked=new Map(rankTransfers(target,pool).map(candidate=>[candidate.transactionId,candidate]));
 const transferCandidates=counterparts
  .map(candidate=>({...candidate,amountCents:candidate.amountCents.toString(),occurredOn:candidate.occurredOn.toISOString(),confidence:ranked.get(candidate.id)?.confidence??null,ownPix:ranked.get(candidate.id)?.ownPix??false}))
  .sort((left,right)=>(right.confidence??-1)-(left.confidence??-1));

 // Sugestão de categoria pela regra atual, só para quem ainda não tem categoria.
 const outcome=item.status==='pending'&&!item.transaction.category?categorize(item.transaction.description,rules):null;
 const suggestedRule=outcome&&(outcome.kind==='apply'||outcome.kind==='suggest')?rules.find(rule=>rule.id===outcome.ruleId):undefined;
 const suggestedCategory=outcome&&(outcome.kind==='apply'||outcome.kind==='suggest')?categories.find(category=>category.id===outcome.categoryId):undefined;
 const suggestion=suggestedRule&&suggestedCategory&&outcome&&outcome.kind!=='none'&&outcome.kind!=='conflict'?{category:suggestedCategory,confidence:outcome.confidence,rule:{pattern:suggestedRule.pattern,matchType:suggestedRule.matchType}}:null;

 return ok({hasProfile:true,item:{...item,transaction:{...item.transaction,occurredOn:item.transaction.occurredOn.toISOString(),amountCents:item.transaction.amountCents.toString()},decisions:item.decisions.map(d=>({...d,createdAt:d.createdAt.toISOString(),revertedAt:d.revertedAt?.toISOString()??null}))},categories,obligations:obligations.map(o=>({...o,amountCents:o.amountCents.toString(),dueDate:o.dueDate.toISOString()})),transferCandidates,suggestion,proposedPattern:proposedPattern(item.transaction.description)});
}
