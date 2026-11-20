import { z } from 'zod';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { isKnownKind, notificationPreferences, saveNotificationPreferences } from '@/server/notifications/service';

/* Preferências da central: modo silencioso e cada tipo ligado ou desligado.
   PUT substitui o conjunto inteiro, então repetir a chamada é idempotente. */

const preferencesSchema = z
  .object({
    quiet: z.boolean(),
    kinds: z.record(z.string().regex(/^[a-z][a-z_]{1,40}$/), z.boolean()),
  })
  .strict()
  .refine((value) => Object.keys(value.kinds).length <= 50 && Object.keys(value.kinds).every(isKnownKind));

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  return ok({ hasProfile: true, ...(await notificationPreferences(guarded.profileId)) });
}

export async function PUT(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = preferencesSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_NOTIFICATION_PREFERENCES', 'As preferências de notificação são inválidas.', 400);
  return ok({ hasProfile: true, ...(await saveNotificationPreferences(guarded.profileId, parsed.data)) });
}
