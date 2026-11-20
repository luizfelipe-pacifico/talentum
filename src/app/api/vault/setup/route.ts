import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { setSession, vaultFailure } from '@/server/vault/http';
import { setupVault } from '@/server/vault/service';

const schema = z.object({ password: z.string().min(1).max(1024) }).strict();

/* Pública: primeiro uso. Recusada com 409 quando o cofre já existe, então repetir o
   pedido não cria um segundo cofre. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_VAULT_REQUEST', 'Informe a senha.', 400);
  try {
    const result = await setupVault(parsed.data.password);
    // O código de recuperação aparece só nesta resposta; o servidor guarda apenas a chave embrulhada por ele.
    return setSession(ok({ recoveryCode: result.recoveryCode, migratedExistingData: result.migratedExistingData }, 201), request, result.sessionToken);
  } catch (error) {
    return vaultFailure(error);
  }
}
