import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { setSession, vaultFailure } from '@/server/vault/http';
import { recoverVault } from '@/server/vault/service';

const schema = z
  .object({ recoveryCode: z.string().min(1).max(64), newPassword: z.string().min(1).max(1024), code: z.string().max(32).optional() })
  .strict();

/* Pública: senha esquecida. O código de recuperação abre o cofre, a senha nova é gravada
   e um código de recuperação novo substitui o usado. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_VAULT_REQUEST', 'Informe o código de recuperação e a senha nova.', 400);
  try {
    const result = await recoverVault(parsed.data.recoveryCode, parsed.data.newPassword, parsed.data.code);
    return setSession(ok({ unlocked: true, recoveryCode: result.recoveryCode }), request, result.sessionToken);
  } catch (error) {
    return vaultFailure(error);
  }
}
