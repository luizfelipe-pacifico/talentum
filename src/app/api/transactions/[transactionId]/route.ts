import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';

const patchSchema = z.object({
  description: z.string().trim().min(1).max(300).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  status: z.enum(['pending', 'posted']).optional(),
  reason: z.string().trim().min(1).max(200).optional(),
}).strict().refine((value) => value.description !== undefined || value.categoryId !== undefined || value.status !== undefined);

const dto = (row: {id:string;occurredOn:Date;description:string;amountCents:bigint;status:string;externalId:string|null;importBatchId:string|null;account:{id:string;name:string};category:{id:string;name:string;kind:string}|null}) => ({
  ...row, occurredOn: row.occurredOn.toISOString(), amountCents: row.amountCents.toString(),
});

export async function GET(request: Request, context: { params: Promise<{ transactionId: string }> }) {
  const guarded=await guardWithProfile(request);if(isDenied(guarded))return guarded.response;const {transactionId}=await context.params;
  const row=await db.transaction.findFirst({where:{id:transactionId,profileId:guarded.profileId},select:{id:true,occurredOn:true,description:true,amountCents:true,status:true,externalId:true,importBatchId:true,account:{select:{id:true,name:true}},category:{select:{id:true,name:true,kind:true}}}});
  if(!row)return fail('TRANSACTION_NOT_FOUND','O lançamento não foi encontrado.',404);return ok({transaction:dto(row)});
}

export async function PATCH(request: Request, context: { params: Promise<{ transactionId: string }> }) {
  const guarded=await guardWithProfile(request);if(isDenied(guarded))return guarded.response;const parsed=patchSchema.safeParse(await readJson(request));if(!parsed.success)return fail('INVALID_TRANSACTION','A alteração informada é inválida.',400);const {transactionId}=await context.params;
  const current=await db.transaction.findFirst({where:{id:transactionId,profileId:guarded.profileId},select:{id:true,description:true,categoryId:true,status:true}});if(!current)return fail('TRANSACTION_NOT_FOUND','O lançamento não foi encontrado.',404);
  if(parsed.data.categoryId){const category=await db.category.findFirst({where:{id:parsed.data.categoryId,profileId:guarded.profileId},select:{id:true}});if(!category)return fail('CATEGORY_NOT_FOUND','A categoria não foi encontrada.',404);}
  const after={description:parsed.data.description??current.description,categoryId:parsed.data.categoryId===undefined?current.categoryId:parsed.data.categoryId,status:parsed.data.status??current.status};
  if(after.description===current.description&&after.categoryId===current.categoryId&&after.status===current.status)return ok({changed:false});
  // Grava só se o lançamento ainda está como foi lido: entre duas edições
  // simultâneas, só uma vence e a revisão registra o "antes" verdadeiro.
  const changed=await db.$transaction(async tx=>{const claimed=await tx.transaction.updateMany({where:{id:transactionId,profileId:guarded.profileId,description:current.description,categoryId:current.categoryId,status:current.status},data:after});if(claimed.count!==1)return true;const revision=await tx.transactionRevision.create({data:{profileId:guarded.profileId,transactionId,beforeJson:JSON.stringify(current),afterJson:JSON.stringify(after),reason:parsed.data.reason??null}});await tx.timelineEvent.create({data:{profileId:guarded.profileId,kind:'transaction_edit',title:'Lançamento alterado',description:'Descrição, categoria ou estado atualizado.',transactionId,transactionRevisionId:revision.id,reversible:true}});return false;});
  if(changed)return fail('TRANSACTION_CHANGED','O lançamento foi alterado em outra janela. Recarregue e tente de novo.',409);;
  return ok({changed:true});
}
