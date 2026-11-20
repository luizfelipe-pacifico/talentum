import { z } from 'zod';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { KEY_PATTERN } from '@/server/notifications/engine';
import { changeNotificationState, notificationCenter } from '@/server/notifications/service';

/* Central de notificações (Stage 10). GET deriva as notificações dos dados
   locais; PATCH grava só o que a pessoa fez com elas — lida ou dispensada.
   Repetir um PATCH não muda nada: o estado é o pedido, não um incremento. */

const changeSchema = z
  .object({
    keys: z.union([z.array(z.string().regex(KEY_PATTERN)).min(1).max(100), z.literal('all')]),
    read: z.boolean().optional(),
    dismissed: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.read !== undefined || value.dismissed !== undefined);

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  return ok({ hasProfile: true, ...(await notificationCenter(guarded.profileId)) });
}

export async function PATCH(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = changeSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_NOTIFICATION_CHANGE', 'A alteração pedida para as notificações é inválida.', 400);
  const result = await changeNotificationState(guarded.profileId, parsed.data);
  return ok({ hasProfile: true, ...result });
}
