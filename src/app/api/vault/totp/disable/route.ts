import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { vaultFailure } from '@/server/vault/http';
import { disableTotp } from '@/server/vault/service';

const schema = z.object({ password: z.string().min(1).max(1024), code: z.string().min(1).max(32) }).strict();

/* Desativar pede a senha e um código atual (ou reserva): quem só passou pela tela
   aberta não desliga o segundo fator. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_VAULT_REQUEST', 'Informe a senha e o código do autenticador.', 400);
  try {
    await disableTotp(parsed.data.password, parsed.data.code);
    return ok({ disabled: true });
  } catch (error) {
    return vaultFailure(error);
  }
}
