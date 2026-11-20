import { isRestorePointId } from '@/server/backup/paths';
import { RestorePointError } from '@/server/backup/restore-core';
import { removeRestorePoint } from '@/server/backup/service';
import { fail, ok, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';

/* Apaga um ponto de restauração. O ID é validado como UUID antes de virar nome
   de arquivo; o ponto que protege uma restauração agendada não pode ser
   apagado enquanto ela estiver pendente. */

export async function DELETE(request: Request, context: { params: Promise<{ restorePointId: string }> }) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const { restorePointId } = await context.params;
  if (!isRestorePointId(restorePointId)) return fail('RESTORE_POINT_NOT_FOUND', 'O ponto de restauração não foi encontrado.', 404);
  try {
    const removed = await removeRestorePoint(await getLocalProfileId(), restorePointId);
    if (!removed) return fail('RESTORE_POINT_NOT_FOUND', 'O ponto de restauração não foi encontrado.', 404);
    return ok({ removed: true });
  } catch (error) {
    if (error instanceof RestorePointError && error.code === 'IN_USE')
      return fail('RESTORE_POINT_IN_USE', 'Este ponto faz parte da restauração agendada. Cancele a restauração antes de apagá-lo.', 409);
    throw error;
  }
}
