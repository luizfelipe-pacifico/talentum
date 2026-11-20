import { db } from '@/server/db';
import { guardWithProfile, isDenied, ok } from '@/server/http';

export async function GET(request:Request){
  const guarded=await guardWithProfile(request);if(isDenied(guarded))return guarded.response;
  const items=await db.reconciliationItem.findMany({where:{profileId:guarded.profileId,status:'pending'},orderBy:{createdAt:'asc'},take:100,select:{id:true,reason:true,confidence:true,createdAt:true,transaction:{select:{id:true,occurredOn:true,description:true,amountCents:true,account:{select:{id:true,name:true}}}}}});
  return ok({hasProfile:true,items:items.map(item=>({...item,createdAt:item.createdAt.toISOString(),transaction:{...item.transaction,occurredOn:item.transaction.occurredOn.toISOString(),amountCents:item.transaction.amountCents.toString()}}))});
}
