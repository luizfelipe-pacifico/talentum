import { db } from '@/server/db';
import { fail,guardWithProfile,isDenied,ok } from '@/server/http';
import { ImportPersistError,revertImport } from '@/server/import/persist';
import { ManualEntryError,revertManualEntry } from '@/server/manual-entries';
import { ReconciliationError,revertDecision } from '@/server/reconciliation';

/* O estado relacionado mudou depois do evento: restaurar o "antes" apagaria uma
   alteração posterior sem aviso. */
class TimelineConflict extends Error {}
type EditedFields={description:string;categoryId:string|null;status:string};

export async function POST(request:Request,context:{params:Promise<{timelineEventId:string}>}){const guarded=await guardWithProfile(request);if(isDenied(guarded))return guarded.response;const {timelineEventId}=await context.params;const event=await db.timelineEvent.findFirst({where:{id:timelineEventId,profileId:guarded.profileId},select:{id:true,kind:true,reversible:true,revertedAt:true,importBatchId:true,transactionId:true,transactionRevisionId:true,reconciliationDecisionId:true}});if(!event)return fail('TIMELINE_EVENT_NOT_FOUND','O evento não foi encontrado.',404);if(!event.reversible||event.revertedAt)return fail('TIMELINE_EVENT_NOT_REVERSIBLE','Esse evento não pode mais ser revertido.',409);
  // Reivindica a reversão antes de executá-la: entre dois cliques simultâneos,
  // só um vence. Se a reversão falhar, a reivindicação é desfeita.
  const claimed=await db.timelineEvent.updateMany({where:{id:event.id,profileId:guarded.profileId,revertedAt:null,reversible:true},data:{revertedAt:new Date(),reversible:false}});
  if(claimed.count!==1)return fail('TIMELINE_EVENT_NOT_REVERSIBLE','Esse evento não pode mais ser revertido.',409);
  const release=()=>db.timelineEvent.updateMany({where:{id:event.id,profileId:guarded.profileId},data:{revertedAt:null,reversible:true}});
  try{if(event.kind==='import'&&event.importBatchId)await revertImport(guarded.profileId,event.importBatchId);else if(event.kind==='reconciliation'&&event.reconciliationDecisionId)await revertDecision(guarded.profileId,event.reconciliationDecisionId);else if(event.kind==='transaction_edit'&&event.transactionId&&event.transactionRevisionId){await db.$transaction(async tx=>{const revision=await tx.transactionRevision.findFirst({where:{id:event.transactionRevisionId!,profileId:guarded.profileId,transactionId:event.transactionId!},select:{beforeJson:true,afterJson:true}});if(!revision)throw new Error('REVISION_NOT_FOUND');const before=JSON.parse(revision.beforeJson) as EditedFields;const after=JSON.parse(revision.afterJson) as EditedFields;
    // Restaura só se o lançamento ainda está como a edição o deixou; uma edição
    // posterior faria a condição falhar, e a reversão vira conflito.
    const restored=await tx.transaction.updateMany({where:{id:event.transactionId!,profileId:guarded.profileId,description:after.description,categoryId:after.categoryId,status:after.status},data:{description:before.description,categoryId:before.categoryId,status:before.status}});if(restored.count!==1)throw new TimelineConflict();})}else if(event.kind==='manual_entry'&&event.transactionId){await revertManualEntry(guarded.profileId,event.transactionId)}else{await release();return fail('TIMELINE_EVENT_NOT_REVERSIBLE','Esse evento não possui ponto de restauração.',409)};return ok({reverted:true})}catch(error){await release();if(error instanceof ImportPersistError||error instanceof ReconciliationError||error instanceof TimelineConflict||error instanceof ManualEntryError)return fail('TIMELINE_REVERT_CONFLICT','O estado relacionado mudou e não pode ser restaurado.',409);return fail('TIMELINE_REVERT_FAILED','O evento não pôde ser revertido.',500)}}
