import { guardWithProfile, isDenied, ok, prismaFailure } from '@/server/http';
import { reapplyRules } from '@/server/auto-reconciliation';

/* Reaplica as regras ativas à fila de conciliação (Feature 6 de docs/PRODUCT.md).

   Só alcança lançamentos pendentes e sem categoria: uma categoria escolhida à
   mão nunca é sobrescrita, e uma regra que a pessoa desfez num lançamento não
   volta para ele. Repetir a chamada não muda nada que já foi aplicado. */

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  try {
    return ok({ hasProfile: true, ...(await reapplyRules(guarded.profileId)) });
  } catch (error) {
    return prismaFailure(error);
  }
}
