import { gamificationSummary } from '@/server/gamification/service';
import { guardWithProfile, isDenied, ok } from '@/server/http';

/* XP, nível, missões e conquistas (Stage 17), derivados dos dados locais.
   Nada aqui considera valores em dinheiro, e nada sai deste computador. */

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  return ok({ hasProfile: true, ...(await gamificationSummary(guarded.profileId)) });
}
