import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { vaultFailure } from '@/server/vault/http';
import { changePassword } from '@/server/vault/service';

const schema = z.object({ currentPassword: z.string().min(1).max(1024), newPassword: z.string().min(1).max(1024) }).strict();

/* Troca a senha: a mesma chave dos dados passa a ser embrulhada pela senha nova. Nada é recifrado. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_VAULT_REQUEST', 'Informe a senha atual e a senha nova.', 400);
  try {
    await changePassword(parsed.data.currentPassword, parsed.data.newPassword);
    return ok({ changed: true });
  } catch (error) {
    return vaultFailure(error);
  }
}
