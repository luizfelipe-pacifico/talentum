import { listRestorePointsView, cancelScheduledRestore } from '@/server/backup/service';
import { ok, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';

/* Restauração agendada para o próximo desbloqueio do cofre: consultar e
   cancelar. Cancelar duas vezes é inofensivo. */

export async function GET(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const { pendingRestore } = await listRestorePointsView();
  return ok({ pendingRestore });
}

export async function DELETE(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const cancelled = await cancelScheduledRestore(await getLocalProfileId());
  return ok({ cancelled });
}
