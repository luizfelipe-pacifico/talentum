import { db } from '@/server/db';

/* Resolução do perfil local.

   O aplicativo é local-first e de perfil único por banco, mas toda consulta
   precisa ser escopada mesmo assim: ESTRUTURA_DE_DADOS.md, seção 4, exige o
   escopo do usuário na consulta e testes negativos de acesso cruzado. Escopar
   agora evita que um segundo perfil transforme isso em vazamento depois. */

/**
 * Identificador do perfil local, ou `null` quando ainda não existe nenhum.
 *
 * Não cria perfil: uma leitura não deve escrever. Sem perfil, a API responde
 * que não há base financeira e a interface leva ao onboarding.
 */
export async function getLocalProfileId(): Promise<string | null> {
  const profile = await db.localProfile.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return profile?.id ?? null;
}
