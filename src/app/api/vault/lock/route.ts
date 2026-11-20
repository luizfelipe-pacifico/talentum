import { ok, requireActionCode } from '@/server/http';
import { setSession } from '@/server/vault/http';
import { lockVault } from '@/server/vault/service';

/* "Bloquear agora": fecha o cofre para todas as janelas e apaga o cookie desta. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  await lockVault();
  return setSession(ok({ locked: true }), request, null);
}
