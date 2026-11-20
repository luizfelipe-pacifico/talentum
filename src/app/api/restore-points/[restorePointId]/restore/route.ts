import { z } from 'zod';
import { isRestorePointId } from '@/server/backup/paths';
import { RestorePointError } from '@/server/backup/restore-core';
import { scheduleRestore } from '@/server/backup/service';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';

/* Agenda a restauração de um ponto.

   Antes de agendar, o backend confere o SHA-256 da cópia e da chave, a
   integridade do SQLite e a versão do schema, e guarda o banco atual num
   ponto automático. A troca só acontece no próximo desbloqueio do cofre
   (docs/ARCHITECTURE.md, §2.9). O corpo precisa trazer a confirmação
   explícita: uma chamada sem ela não agenda nada. */

const restoreSchema = z.object({ confirm: z.literal('restore') }).strict();

const MESSAGES: Record<RestorePointError['code'], [string, string, number]> = {
  NOT_FOUND: ['RESTORE_POINT_NOT_FOUND', 'O ponto de restauração não foi encontrado.', 404],
  CHECKSUM_MISMATCH: ['RESTORE_POINT_DAMAGED', 'A cópia deste ponto foi alterada ou está incompleta e não pode ser restaurada.', 409],
  INTEGRITY_FAILED: ['RESTORE_POINT_DAMAGED', 'A cópia deste ponto não passou na verificação de integridade e não pode ser restaurada.', 409],
  SCHEMA_UNKNOWN: ['RESTORE_POINT_INCOMPATIBLE', 'Este ponto foi criado por uma versão do Talentum que esta versão não reconhece.', 409],
  SNAPSHOT_FAILED: ['RESTORE_FAILED', 'Não foi possível guardar os dados atuais antes de restaurar. Nada foi alterado.', 500],
  IN_USE: ['RESTORE_FAILED', 'Não foi possível agendar a restauração. Nada foi alterado.', 409],
};

export async function POST(request: Request, context: { params: Promise<{ restorePointId: string }> }) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const { restorePointId } = await context.params;
  if (!isRestorePointId(restorePointId)) return fail('RESTORE_POINT_NOT_FOUND', 'O ponto de restauração não foi encontrado.', 404);
  if (!restoreSchema.safeParse(await readJson(request)).success)
    return fail('RESTORE_CONFIRMATION_REQUIRED', 'Confirme a restauração para continuar.', 400);
  try {
    const result = await scheduleRestore(await getLocalProfileId(), restorePointId);
    return ok({ scheduled: true, restartRequired: true, safetyRestorePointId: result.safetyRestorePointId });
  } catch (error) {
    if (error instanceof RestorePointError) {
      const [code, message, status] = MESSAGES[error.code];
      return fail(code, message, status);
    }
    throw error;
  }
}
