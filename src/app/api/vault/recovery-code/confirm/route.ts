import { ok, requireActionCode } from '@/server/http';
import { vaultFailure } from '@/server/vault/http';
import { confirmRecoveryCode } from '@/server/vault/service';

/* A pessoa declarou que guardou o código. Repetir não muda nada. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  try {
    await confirmRecoveryCode();
    return ok({ confirmed: true });
  } catch (error) {
    return vaultFailure(error);
  }
}
