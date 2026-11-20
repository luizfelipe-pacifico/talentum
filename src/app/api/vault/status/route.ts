import { ok, requireActionCode } from '@/server/http';
import { vaultFailure } from '@/server/vault/http';
import { vaultStatus } from '@/server/vault/service';
import { readSessionToken, sessionIsValid } from '@/server/vault/session';

/* Pública: a tela de bloqueio precisa saber se mostra "criar senha" ou "desbloquear".
   Não devolve dado financeiro nem diz nada além do estado do cofre. */
export async function GET(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  try {
    return ok(await vaultStatus(sessionIsValid(readSessionToken(request))));
  } catch (error) {
    return vaultFailure(error);
  }
}
