import { db } from '@/server/db';
import { prismaErrorKind } from '@/server/prisma-errors';

/* Resolução do perfil local.

   O aplicativo é local-first e de perfil único por banco, mas toda consulta
   precisa ser escopada mesmo assim: docs/DATABASE.md exige o
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

/**
 * Garante o perfil local e devolve o seu identificador.
 *
 * Idempotente mesmo sob concorrência: o índice único de `singletonKey` faz a
 * segunda criação simultânea falhar com P2002, e quem perdeu a corrida relê o
 * perfil que a outra requisição criou (docs/SECURITY.md, item 19).
 */
export async function ensureLocalProfile(displayName: string | null): Promise<{ profileId: string; created: boolean }> {
  const existing = await getLocalProfileId();
  if (existing) return { profileId: existing, created: false };
  try {
    const profile = await db.localProfile.create({ data: { displayName }, select: { id: true } });
    return { profileId: profile.id, created: true };
  } catch (error) {
    if (prismaErrorKind(error) === 'conflict') {
      const winner = await getLocalProfileId();
      if (winner) return { profileId: winner, created: false };
    }
    throw error;
  }
}
