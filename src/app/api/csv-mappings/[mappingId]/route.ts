import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { forgetMapping } from '@/server/import/mapping-profiles';

/* Remoção de um mapeamento salvo.

   Escopada por perfil: um ID opaco não é autorização
   (docs/ESTRUTURA_DE_DADOS.md, §4). Apagar o mapeamento não afeta nenhuma
   importação já gravada — ele só influencia a próxima leitura de arquivo. */

type Context = { params: Promise<{ mappingId: string }> };

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { mappingId } = await context.params;
  const removed = await forgetMapping(guarded.profileId, mappingId);
  if (!removed) return fail('MAPPING_NOT_FOUND', 'O mapeamento informado não existe.', 404);

  return ok({ removed: true });
}
