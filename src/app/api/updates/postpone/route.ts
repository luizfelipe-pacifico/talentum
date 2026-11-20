import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok, readJson } from '@/server/http';
import { parseSemver, POSTPONE_MS, POSTPONE_PREFERENCE_KEY } from '@/server/updates';

/* Adiar o aviso de nova versão por 24 horas, para aquela versão.

   Guarda `{ version, until }` em `UserPreference`, no SQLite local. Repetir o
   pedido só renova o prazo (upsert): é idempotente. Uma versão mais nova que a
   adiada volta a aparecer, porque o adiamento vale para uma versão só. */

const schema = z.object({ version: z.string().max(32).refine((value) => parseSemver(value) !== null) }).strict();

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return fail('INVALID_UPDATE_VERSION', 'A versão informada é inválida.', 400);

  const until = Date.now() + POSTPONE_MS;
  const value = JSON.stringify({ version: parsed.data.version.replace(/^v/, ''), until });
  await db.userPreference.upsert({
    where: { profileId_key: { profileId: guarded.profileId, key: POSTPONE_PREFERENCE_KEY } },
    create: { profileId: guarded.profileId, key: POSTPONE_PREFERENCE_KEY, value },
    update: { value },
  });
  return ok({ postponedUntil: new Date(until).toISOString() });
}
