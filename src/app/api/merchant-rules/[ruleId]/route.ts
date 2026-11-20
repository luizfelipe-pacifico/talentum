import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { db } from '@/server/db';

/* Desativa uma regra de categorização.

   A regra sai das próximas importações e da reaplicação, mas o que ela já
   categorizou continua registrado, com a decisão auditável de cada lançamento:
   desativar não reescreve o passado. Repetir a chamada responde igual. */

export async function DELETE(request: Request, context: { params: Promise<{ ruleId: string }> }) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const { ruleId } = await context.params;
  const rule = await db.merchantRule.findFirst({ where: { id: ruleId, profileId: guarded.profileId }, select: { id: true } });
  if (!rule) return fail('MERCHANT_RULE_NOT_FOUND', 'A regra não foi encontrada.', 404);
  await db.merchantRule.updateMany({ where: { id: rule.id, profileId: guarded.profileId }, data: { isActive: false } });
  return ok({ deactivated: true });
}
