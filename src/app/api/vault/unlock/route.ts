import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { setSession, vaultFailure } from '@/server/vault/http';
import { unlockVault } from '@/server/vault/service';

const schema = z.object({ password: z.string().min(1).max(1024), code: z.string().max(32).optional() }).strict();

/* Pública: abre o cofre e a sessão. Senha e código do autenticador seguem juntos e o
   erro é o mesmo para os dois, para a resposta não indicar qual fator está certo. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_VAULT_REQUEST', 'Informe a senha.', 400);
  try {
    const result = await unlockVault(parsed.data.password, parsed.data.code);
    return setSession(ok({ unlocked: true, recoveryCode: result.recoveryCode }), request, result.sessionToken);
  } catch (error) {
    return vaultFailure(error);
  }
}
