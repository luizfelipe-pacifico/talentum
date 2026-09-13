import { db } from '@/server/db';
import { fail,guardWithProfile,isDenied,ok } from '@/server/http';

export async function GET(request:Request,context:{params:Promise<{reconciliationItemId:string}>}){
 const guarded=await guardWithProfile(request);if(isDenied(guarded))return guarded.response;const {reconciliationItemId}=await context.params;
 const item=await db.reconciliationItem.findFirst({where:{id:reconciliationItemId,profileId:guarded.profileId},select:{id:true,reason:true,confidence:true,status:true,transaction:{select:{id:true,occurredOn:true,description:true,amountCents:true,status:true,category:{select:{id:true,name:true,kind:true}},account:{select:{id:true,name:true}}}},decisions:{orderBy:{createdAt:'desc'},select:{id:true,kind:true,createdAt:true,revertedAt:true}}}});
 if(!item)return fail('ITEM_NOT_FOUND','O item de conciliação não foi encontrado.',404);
 const [categories,obligations,transferCandidates]=await Promise.all([
  db.category.findMany({where:{profileId:guarded.profileId},orderBy:{name:'asc'},select:{id:true,name:true,kind:true}}),
  db.scheduledObligation.findMany({where:{profileId:guarded.profileId,status:'open'},orderBy:{dueDate:'asc'},select:{id:true,description:true,amountCents:true,dueDate:true}}),
  db.transaction.findMany({where:{profileId:guarded.profileId,accountId:{not:item.transaction.account.id},amountCents:-item.transaction.amountCents,status:{in:['posted','pending']}},orderBy:{occurredOn:'desc'},take:20,select:{id:true,occurredOn:true,description:true,amountCents:true,account:{select:{id:true,name:true}}}}),
 ]);
 return ok({hasProfile:true,item:{...item,transaction:{...item.transaction,occurredOn:item.transaction.occurredOn.toISOString(),amountCents:item.transaction.amountCents.toString()},decisions:item.decisions.map(d=>({...d,createdAt:d.createdAt.toISOString(),revertedAt:d.revertedAt?.toISOString()??null}))},categories,obligations:obligations.map(o=>({...o,amountCents:o.amountCents.toString(),dueDate:o.dueDate.toISOString()})),transferCandidates:transferCandidates.map(t=>({...t,amountCents:t.amountCents.toString(),occurredOn:t.occurredOn.toISOString()}))});
}
