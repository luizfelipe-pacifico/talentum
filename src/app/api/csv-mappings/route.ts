import { guardWithProfile, isDenied, ok } from '@/server/http';
import { listSavedMappings } from '@/server/import/mapping-profiles';

/* Mapeamentos de coluna salvos.

   Feature 4 de docs/ROUTING_MVP.md. Existem para que a pessoa não reconfira as
   mesmas colunas a cada extrato do mesmo banco. São conveniência local: não
   guardam valor, lançamento nem nada do conteúdo do extrato — apenas o papel
   de cada coluna e o dialeto do arquivo. */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  return ok({ hasProfile: true, mappings: await listSavedMappings(guarded.profileId) });
}
