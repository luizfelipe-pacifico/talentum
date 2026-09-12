import { z } from 'zod';
import { decide,ReconciliationError } from '@/server/reconciliation';
import { fail,guardWithProfile,isDenied,ok,readJson } from '@/server/http';

const schema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('confirm')}).strict(),
 z.object({kind:z.literal('category'),categoryId:z.string().uuid()}).strict(),
 z.object({kind:z.literal('obligation'),obligationId:z.string().uuid()}).strict(),
 z.object({kind:z.literal('adjustment'),adjustedAmountCents:z.string().regex(/^-?\d+$/),adjustmentKind:z.enum(['interest','fee','discount','correction']),note:z.string().trim().max(200).optional()}).strict(),
 z.object({kind:z.literal('transfer'),counterpartTransactionId:z.string().uuid(),categoryId:z.string().uuid()}).strict(),
]);
const errors:Record<string,[string,number]>={ITEM_NOT_FOUND:['O item pendente não foi encontrado.',404],CATEGORY_NOT_FOUND:['A categoria não foi encontrada.',404],COUNTERPART_NOT_FOUND:['O lançamento de contrapartida não foi encontrado.',404],INVALID_TRANSFER:['A transferência informada é inválida.',400]};
export async function POST(request:Request,context:{params:Promise<{reconciliationItemId:string}>}){const guarded=await guardWithProfile(request);if(isDenied(guarded))return guarded.response;const parsed=schema.safeParse(await readJson(request));if(!parsed.success)return fail('INVALID_DECISION','A decisão informada é inválida.',400);try{const {reconciliationItemId}=await context.params;return ok(await decide(guarded.profileId,reconciliationItemId,parsed.data),201)}catch(error){if(error instanceof ReconciliationError){const [message,status]=errors[error.code]??['A decisão não pôde ser aplicada.',409];return fail(error.code,message,status)}throw error}}
