import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { vaultFailure } from '@/server/vault/http';
import { securitySettings, updateAutoLock } from '@/server/vault/service';
import { MAX_AUTO_LOCK_MINUTES, MIN_AUTO_LOCK_MINUTES } from '@/server/vault/session';

const schema = z.object({ autoLockMinutes: z.number().int().min(MIN_AUTO_LOCK_MINUTES).max(MAX_AUTO_LOCK_MINUTES) }).strict();

export async function GET(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  try {
    return ok(await securitySettings());
  } catch (error) {
    return vaultFailure(error);
  }
}

export async function PATCH(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_AUTO_LOCK', `Escolha entre ${MIN_AUTO_LOCK_MINUTES} e ${MAX_AUTO_LOCK_MINUTES} minutos.`, 400);
  try {
    await updateAutoLock(parsed.data.autoLockMinutes);
    return ok(await securitySettings());
  } catch (error) {
    return vaultFailure(error);
  }
}
