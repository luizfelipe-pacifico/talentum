import { z } from 'zod';
import { RestorePointError } from '@/server/backup/restore-core';
import { createManualRestorePoint, listRestorePointsView } from '@/server/backup/service';
import { fail, ok, readJson, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';

/* Pontos de restauração (Stage 11).

   Pertencem ao dispositivo, não ao perfil: continuam listados depois de
   "apagar todos os dados", que apaga o perfil, porque é por eles que a pessoa
   desfaz a exclusão. Por isso a rota exige o código de ação, mas não um perfil.
   Nenhum caminho de arquivo entra ou sai daqui: só IDs opacos.

   POST exige `idempotencyKey`: a mesma chave devolve o mesmo ponto, então um
   clique repetido ou uma nova tentativa depois de falha de rede não cria dois. */

const createSchema = z.object({ idempotencyKey: z.string().uuid() }).strict();

export async function GET(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  return ok(await listRestorePointsView());
}

export async function POST(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_RESTORE_POINT', 'O pedido de ponto de restauração é inválido.', 400);
  try {
    const result = await createManualRestorePoint(await getLocalProfileId(), parsed.data.idempotencyKey);
    return ok(result, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof RestorePointError)
      return fail('RESTORE_POINT_FAILED', 'Não foi possível criar o ponto de restauração. Os dados atuais não foram alterados.', 500);
    throw error;
  }
}
