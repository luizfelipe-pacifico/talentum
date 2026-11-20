import { guardWithProfile, isDenied, ok } from '@/server/http';
import { BAND_MAX_BPS, BAND_MIN_BPS, TARGET_BPS } from '@/server/arca-metrics';
import { loadSurvival, toWire } from '@/server/planning-queries';
import { loadNetWorth } from '@/server/portfolio-queries';

/* Patrimônio e os quatro pilares da metodologia ARCA (Thiago Nigro).
   Calcula proporções e a situação de cada pilar na banda; não recomenda. */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const [{ assets, summary }, survival] = await Promise.all([loadNetWorth(guarded.profileId), loadSurvival(guarded.profileId, new Date())]);
  return ok({
    hasProfile: true,
    band: { minBps: BAND_MIN_BPS, targetBps: TARGET_BPS, maxBps: BAND_MAX_BPS },
    summary: toWire(summary),
    assets: toWire(assets),
    survival: toWire(survival),
  });
}
