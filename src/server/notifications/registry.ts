/* Fontes de notificação registradas.

   Para uma funcionalidade nova avisar alguma coisa (orçamento estourando,
   fatura de cartão fechando), basta criar uma `NotificationSource` — `load`
   lê o banco escopado pelo perfil, `derive` é a regra pura e testável — e
   acrescentá-la a `NOTIFICATION_SOURCES`. O núcleo (`engine.ts`), as
   preferências e a interface passam a tratá-la sem outra mudança. */

import { db } from '@/server/db';
import { backupDirectory } from '@/server/backup/paths';
import { listRestorePoints } from '@/server/backup/restore-core';
import type { NotificationKindInfo, NotificationSource } from '@/server/notifications/engine';
import {
  BUILTIN_KINDS,
  deriveImportIssueNotifications,
  deriveObligationNotifications,
  deriveReconciliationNotification,
  deriveRestorePointNotification,
  deriveStaleImportNotifications,
  DUE_SOON_DAYS,
  RECENT_IMPORT_ISSUE_DAYS,
  type AccountImportInput,
  type ImportIssueInput,
  type ObligationInput,
} from '@/server/notifications/rules';

const DAY = 86_400_000;

const obligations: NotificationSource<ObligationInput[]> = {
  id: 'obligations',
  kinds: BUILTIN_KINDS.obligations,
  load: (profileId) =>
    db.scheduledObligation.findMany({
      where: { profileId, status: 'open', dueDate: { lte: new Date(Date.now() + (DUE_SOON_DAYS + 1) * DAY) } },
      orderBy: { dueDate: 'asc' },
      take: 100,
      select: { id: true, description: true, amountCents: true, dueDate: true },
    }),
  derive: deriveObligationNotifications,
};

const reconciliation: NotificationSource<{ count: number; oldest: Date | null }> = {
  id: 'reconciliation',
  kinds: BUILTIN_KINDS.reconciliation,
  async load(profileId) {
    const [count, oldest] = await Promise.all([
      db.reconciliationItem.count({ where: { profileId, status: 'pending' } }),
      db.reconciliationItem.findFirst({ where: { profileId, status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return { count, oldest: oldest?.createdAt ?? null };
  },
  derive: (input, now) => deriveReconciliationNotification(input.count, input.oldest, now),
};

const imports: NotificationSource<{ accounts: AccountImportInput[]; batches: ImportIssueInput[] }> = {
  id: 'imports',
  kinds: BUILTIN_KINDS.imports,
  async load(profileId) {
    const [accounts, coverage, recent] = await Promise.all([
      db.account.findMany({ where: { profileId, isActive: true }, select: { id: true, name: true } }),
      db.importBatch.groupBy({ by: ['accountId'], where: { profileId, accountId: { not: null } }, _max: { periodEnd: true, importedAt: true } }),
      db.importBatch.findMany({
        where: { profileId, importedAt: { gte: new Date(Date.now() - (RECENT_IMPORT_ISSUE_DAYS + 1) * DAY) } },
        orderBy: { importedAt: 'desc' },
        take: 20,
        select: { id: true, fileName: true, importedAt: true, _count: { select: { issues: { where: { severity: 'error' } } } } },
      }),
    ]);
    const byAccount = new Map(coverage.map((row) => [row.accountId, row._max.periodEnd ?? row._max.importedAt ?? null]));
    return {
      accounts: accounts.map((account) => ({ id: account.id, name: account.name, lastCoveredDay: byAccount.get(account.id) ?? null })),
      batches: recent.map((batch) => ({ id: batch.id, fileName: batch.fileName, importedAt: batch.importedAt, errorCount: batch._count.issues })),
    };
  },
  derive: (input, now) => [...deriveStaleImportNotifications(input.accounts, now), ...deriveImportIssueNotifications(input.batches, now)],
};

const backup: NotificationSource<{ last: Date | null; hasData: boolean }> = {
  id: 'backup',
  kinds: BUILTIN_KINDS.backup,
  async load(profileId) {
    const [points, transactions] = await Promise.all([listRestorePoints(backupDirectory()), db.transaction.count({ where: { profileId } })]);
    const latest = points.find((point) => point.status === 'available');
    return { last: latest ? new Date(latest.createdAt) : null, hasData: transactions > 0 };
  },
  derive: (input, now) => deriveRestorePointNotification(input.last, input.hasData, now),
};

// biome-ignore lint/suspicious/noExplicitAny: cada fonte tem a própria entrada; o registro só as percorre
export const NOTIFICATION_SOURCES: NotificationSource<any>[] = [obligations, reconciliation, imports, backup];

export function notificationKinds(): NotificationKindInfo[] {
  return NOTIFICATION_SOURCES.flatMap((source) => [...source.kinds]);
}
