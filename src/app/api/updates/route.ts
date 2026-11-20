import packageJson from '../../../../package.json';
import { db } from '@/server/db';
import { ok, requireActionCode } from '@/server/http';
import { getLocalProfileId } from '@/server/profile';
import { checkForUpdate, isPostponed, POSTPONE_PREFERENCE_KEY } from '@/server/updates';

/* Aviso de nova versão (docs/PRODUCT.md).

   Devolve a versão em execução e, quando existe, a release estável mais nova do
   repositório oficial, com notas já sanitizadas. `notify` diz se a interface
   deve abrir o aviso agora: falso quando a pessoa adiou esta mesma versão há
   menos de 24 horas. Não exige perfil: o aviso vale antes do primeiro acesso,
   e sem perfil não há adiamento guardado. */

export async function GET(request: Request) {
  const denied = requireActionCode(request);
  if (denied) return denied;

  // `TALENTUM_UPDATE_CHECK=off` desliga a consulta (testes, uso sem rede).
  if (process.env.TALENTUM_UPDATE_CHECK === 'off') return ok({ status: 'unavailable', currentVersion: packageJson.version, notify: false });
  const result = await checkForUpdate({ fetchImpl: fetch, currentVersion: packageJson.version, target: { platform: process.platform, arch: process.arch } });
  if (result.status !== 'update-available') return ok({ ...result, notify: false });

  const profileId = await getLocalProfileId();
  const preference = profileId
    ? await db.userPreference.findUnique({ where: { profileId_key: { profileId, key: POSTPONE_PREFERENCE_KEY } }, select: { value: true } })
    : null;
  return ok({ ...result, notify: !isPostponed(preference?.value, result.release.version, Date.now()) });
}
