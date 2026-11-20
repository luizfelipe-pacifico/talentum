/* Central de notificações ligada ao banco local. */

import { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import {
  buildNotificationCenter,
  KIND_PREFERENCE_PREFIX,
  notificationKey,
  preferencesFromRows,
  QUIET_PREFERENCE,
  type NotificationCandidate,
} from '@/server/notifications/engine';
import { NOTIFICATION_SOURCES, notificationKinds } from '@/server/notifications/registry';

/** Estados de notificações que deixaram de existir são esquecidos depois disso. */
const STATE_RETENTION_DAYS = 180;

async function loadPreferences(profileId: string) {
  const rows = await db.userPreference.findMany({
    where: { profileId, key: { startsWith: 'notifications.' } },
    select: { key: true, value: true },
  });
  return preferencesFromRows(rows);
}

async function collectCandidates(profileId: string, now: Date): Promise<NotificationCandidate[]> {
  const results = await Promise.allSettled(
    NOTIFICATION_SOURCES.map(async (source) => source.derive(await source.load(profileId), now) as NotificationCandidate[]),
  );
  // Uma fonte com falha não derruba a central: as outras continuam avisando.
  return results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

export async function notificationCenter(profileId: string, now = new Date()) {
  const [candidates, preferences, states] = await Promise.all([
    collectCandidates(profileId, now),
    loadPreferences(profileId),
    db.notificationState.findMany({ where: { profileId }, select: { key: true, readAt: true, dismissedAt: true } }),
  ]);
  return buildNotificationCenter(candidates, states, preferences);
}

export type StateChange = { keys: string[] | 'all'; read?: boolean; dismissed?: boolean };

/**
 * Marca como lida, não lida, dispensada ou de volta. Idempotente: repetir a
 * mesma mudança não altera nada. Só aceita chaves que existem agora, para que
 * a tabela não guarde chaves inventadas pela requisição.
 */
export async function changeNotificationState(profileId: string, change: StateChange, now = new Date()) {
  const candidates = await collectCandidates(profileId, now);
  const current = new Map(candidates.map((candidate) => [notificationKey(candidate), candidate.kind]));
  const keys = change.keys === 'all' ? [...current.keys()] : change.keys.filter((key) => current.has(key));

  const apply = () => db.$transaction(async (tx) => {
    for (const key of keys) {
      const data = {
        ...(change.read === undefined ? {} : { readAt: change.read ? now : null }),
        ...(change.dismissed === undefined ? {} : { dismissedAt: change.dismissed ? now : null }),
      };
      const existing = await tx.notificationState.findFirst({ where: { profileId, key }, select: { id: true, readAt: true, dismissedAt: true } });
      if (!existing) {
        await tx.notificationState.create({ data: { profileId, key, kind: current.get(key) ?? 'unknown', readAt: null, dismissedAt: null, ...data } });
        continue;
      }
      // Não regrava o instante de quem já estava lido ou dispensado.
      const update = {
        ...(change.read === undefined || Boolean(existing.readAt) === change.read ? {} : { readAt: data.readAt }),
        ...(change.dismissed === undefined || Boolean(existing.dismissedAt) === change.dismissed ? {} : { dismissedAt: data.dismissedAt }),
      };
      if (Object.keys(update).length > 0) await tx.notificationState.updateMany({ where: { id: existing.id, profileId }, data: update });
    }
    await tx.notificationState.deleteMany({
      where: { profileId, updatedAt: { lt: new Date(now.getTime() - STATE_RETENTION_DAYS * 86_400_000) } },
    });
  });

  try {
    await apply();
  } catch (error) {
    // Duas mudanças simultâneas na mesma chave nova: a segunda encontra a linha
    // criada pela primeira e repete como atualização.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    await apply();
  }

  return { updated: keys.length };
}

export async function notificationPreferences(profileId: string) {
  const preferences = await loadPreferences(profileId);
  return {
    quiet: preferences.quiet,
    kinds: notificationKinds().map((info) => ({ ...info, enabled: !preferences.disabledKinds.has(info.kind) })),
  };
}

/** Grava as preferências inteiras. PUT idempotente: o mesmo corpo, o mesmo estado. */
export async function saveNotificationPreferences(profileId: string, input: { quiet: boolean; kinds: Record<string, boolean> }) {
  const known = new Set(notificationKinds().map((info) => info.kind));
  const entries: [string, string][] = [[QUIET_PREFERENCE, input.quiet ? 'on' : 'off']];
  for (const [kind, enabled] of Object.entries(input.kinds)) {
    if (known.has(kind)) entries.push([`${KIND_PREFERENCE_PREFIX}${kind}`, enabled ? 'on' : 'off']);
  }
  await db.$transaction(
    entries.map(([key, value]) =>
      db.userPreference.upsert({ where: { profileId_key: { profileId, key } }, create: { profileId, key, value }, update: { value } }),
    ),
  );
  return notificationPreferences(profileId);
}

export function isKnownKind(kind: string) {
  return notificationKinds().some((info) => info.kind === kind);
}
