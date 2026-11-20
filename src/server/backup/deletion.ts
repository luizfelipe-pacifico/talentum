/* "Apagar todos os dados locais".

   Apaga o perfil local, e com ele, em cascata, todas as tabelas do perfil
   (docs/DATABASE.md). Antes, por padrão, guarda um ponto de restauração: a
   exclusão é a operação mais destrutiva do aplicativo, e o ponto é o que
   permite voltar atrás. Quem marca também "apagar os pontos de restauração"
   assume uma exclusão sem volta, e nenhum ponto é criado.

   Depois da exclusão o banco passa por `VACUUM`: sem ele, o conteúdo apagado
   continuaria nas páginas livres do arquivo SQLite até ser sobrescrito.

   A frase digitada na confirmação é conferida no backend. Repetir a chamada
   sem perfil é inofensivo: responde que não havia dados. */

import { db } from '@/server/db';
import { backupDirectory } from '@/server/backup/paths';
import { deleteAllRestorePoints } from '@/server/backup/restore-core';
import { createAutomaticRestorePoint, exclusive } from '@/server/backup/service';

export const DELETION_PHRASE = 'APAGAR MEUS DADOS';

export function deleteAllLocalData(profileId: string | null, includeRestorePoints: boolean) {
  return exclusive(async () => {
    let restorePointId: string | null = null;
    let removedRestorePoints = 0;

    if (includeRestorePoints) removedRestorePoints = await deleteAllRestorePoints(backupDirectory());
    else if (profileId) restorePointId = (await createAutomaticRestorePoint('pre_deletion', profileId)).id;

    let deleted = false;
    if (profileId) {
      const result = await db.localProfile.deleteMany({ where: { id: profileId } });
      deleted = result.count > 0;
    }
    if (deleted || includeRestorePoints) await db.$executeRawUnsafe('VACUUM');

    return { deleted, restorePointId, removedRestorePoints };
  });
}
