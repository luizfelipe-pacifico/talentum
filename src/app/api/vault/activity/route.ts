import { ok, requireActionCode } from '@/server/http';
import { recordActivity, secondsUntilAutoLock } from '@/server/vault/session';

/* A interface relata uso real (teclado, ponteiro, toque). Só isso adia o bloqueio
   automático: consultas feitas sozinhas pela tela não contam como presença. */
export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  recordActivity();
  return ok({ secondsUntilAutoLock: secondsUntilAutoLock() });
}
