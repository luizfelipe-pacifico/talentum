import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';

export async function GET(request:Request,context:{params:Promise<{transactionId:string}>}){
  const guarded=await guardWithProfile(request);if(isDenied(guarded))return guarded.response;const {transactionId}=await context.params;
  const owned=await db.transaction.findFirst({where:{id:transactionId,profileId:guarded.profileId},select:{id:true}});if(!owned)return fail('TRANSACTION_NOT_FOUND','O lançamento não foi encontrado.',404);
  const rows=await db.transactionRevision.findMany({where:{transactionId,profileId:guarded.profileId},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true,beforeJson:true,afterJson:true,reason:true,createdAt:true}});
  return ok({history:rows.map(row=>({id:row.id,before:JSON.parse(row.beforeJson),after:JSON.parse(row.afterJson),reason:row.reason,createdAt:row.createdAt.toISOString()}))});
}
