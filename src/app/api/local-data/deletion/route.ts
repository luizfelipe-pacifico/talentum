import { z } from 'zod';
import { DELETION_PHRASE, deleteAllLocalData } from '@/server/backup/deletion';
import { RestorePointError } from '@/server/backup/restore-core';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';

/* "Apagar todos os dados locais" (Stage 19).

   A frase digitada é conferida aqui, no backend: uma chamada sem ela não apaga
   nada. Por padrão um ponto de restauração é criado antes; se ele falhar, a
   exclusão não acontece. Repetir a chamada sem perfil responde
   `deleted: false` e não muda nada. */

const schema = z
  .object({
    confirmation: z.literal(DELETION_PHRASE),
    includeRestorePoints: z.boolean().default(false),
  })
  .strict();

export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('DELETION_CONFIRMATION_REQUIRED', `Digite ${DELETION_PHRASE} para confirmar.`, 400);
  try {
    const result = await deleteAllLocalData(await getLocalProfileId(), parsed.data.includeRestorePoints);
    return ok(result);
  } catch (error) {
    if (error instanceof RestorePointError)
      return fail('DELETION_ABORTED', 'Não foi possível criar o ponto de restauração antes de apagar. Nenhum dado foi apagado.', 500);
    throw error;
  }
}
