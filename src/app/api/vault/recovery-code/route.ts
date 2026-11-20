import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { vaultFailure } from '@/server/vault/http';
import { regenerateRecoveryCode } from '@/server/vault/service';

const schema = z.object({ password: z.string().min(1).max(1024) }).strict();

/* Gera um código de recuperação novo; o anterior deixa de funcionar na hora. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_VAULT_REQUEST', 'Informe a senha.', 400);
  try {
    return ok(await regenerateRecoveryCode(parsed.data.password));
  } catch (error) {
    return vaultFailure(error);
  }
}
