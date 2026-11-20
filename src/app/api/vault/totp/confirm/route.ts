import { z } from 'zod';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { vaultFailure } from '@/server/vault/http';
import { confirmTotpEnrollment } from '@/server/vault/service';

const schema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

/* Ativa o autenticador depois de um código válido e devolve os códigos reserva, uma única vez. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_TOTP', 'Digite os 6 números que aparecem no aplicativo autenticador.', 400);
  try {
    return ok(await confirmTotpEnrollment(parsed.data.code));
  } catch (error) {
    return vaultFailure(error);
  }
}
