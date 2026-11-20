/* Exportação dos dados locais (docs/DATABASE.md, "Export format").

   JSON: todas as tabelas do perfil, com `schemaVersion` do formato de
   exportação e a migration aplicada no banco. Valores em centavos saem como
   string de inteiro, instantes em ISO 8601 — o mesmo contrato da API.

   Fica de fora só o que não serve fora deste computador e seria risco no
   arquivo: o índice HMAC e a cifra das chaves PIX (sem a chave do dispositivo
   não abrem). A chave PIX sai mascarada, como a tela mostra. Para levar tudo,
   inclusive as chaves PIX, use o backup cifrado. */

import { db } from '@/server/db';
import { transactionsCsv } from '@/server/export/csv';

export const EXPORT_FORMAT = 'talentum-export';
export const EXPORT_SCHEMA_VERSION = 1;

/** BigInt vira string e Date vira ISO 8601; o resto passa como está. */
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item), 2);
}

export async function buildJsonExport(profileId: string, now = new Date()) {
  const where = { profileId };
  const [
    profile,
    preferences,
    onboardingSessions,
    onboardingAnswers,
    institutions,
    accounts,
    balanceSnapshots,
    pixIdentifiers,
    categories,
    incomeSources,
    scheduledObligations,
    merchantRules,
    csvMappingProfiles,
    importBatches,
    importFiles,
    importIssues,
    transactions,
    transactionRevisions,
    reconciliationItems,
    reconciliationDecisions,
    financialAdjustments,
    ownAccountTransfers,
    timelineEvents,
    databaseBackups,
    notificationStates,
    monthlyReviews,
    migration,
  ] = await Promise.all([
    db.localProfile.findFirst({ where: { id: profileId } }),
    db.userPreference.findMany({ where, orderBy: { key: 'asc' } }),
    db.onboardingSession.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.onboardingAnswer.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.institution.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.account.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.balanceSnapshot.findMany({ where: { account: { profileId } }, orderBy: { capturedAt: 'asc' } }),
    db.pixIdentifier.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { id: true, accountId: true, type: true, label: true, maskedValue: true, isActive: true, validFrom: true, validUntil: true, source: true, createdAt: true, updatedAt: true },
    }),
    db.category.findMany({ where, orderBy: { name: 'asc' } }),
    db.incomeSource.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.scheduledObligation.findMany({ where, orderBy: { dueDate: 'asc' } }),
    db.merchantRule.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.csvMappingProfile.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.importBatch.findMany({ where, orderBy: { importedAt: 'asc' } }),
    db.importFile.findMany({ where: { importBatch: { profileId } }, orderBy: { createdAt: 'asc' } }),
    db.importIssue.findMany({ where: { importBatch: { profileId } }, orderBy: [{ importBatchId: 'asc' }, { lineNumber: 'asc' }] }),
    db.transaction.findMany({ where, orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }] }),
    db.transactionRevision.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.reconciliationItem.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.reconciliationDecision.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.financialAdjustment.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.ownAccountTransfer.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.timelineEvent.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.databaseBackup.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.notificationState.findMany({ where, orderBy: { createdAt: 'asc' } }),
    db.monthlyReview.findMany({ where, orderBy: { month: 'asc' } }),
    db.$queryRawUnsafe<{ migration_name: string }[]>(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1',
    ),
  ]);

  return serialize({
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    databaseMigration: migration[0]?.migration_name ?? null,
    exportedAt: now.toISOString(),
    profile,
    tables: {
      userPreferences: preferences,
      onboardingSessions,
      onboardingAnswers,
      institutions,
      accounts,
      balanceSnapshots,
      pixIdentifiers,
      categories,
      incomeSources,
      scheduledObligations,
      merchantRules,
      csvMappingProfiles,
      importBatches,
      importFiles,
      importIssues,
      transactions,
      transactionRevisions,
      reconciliationItems,
      reconciliationDecisions,
      financialAdjustments,
      ownAccountTransfers,
      timelineEvents,
      databaseBackups,
      notificationStates,
      monthlyReviews,
    },
  });
}

export async function buildTransactionsCsv(profileId: string) {
  const rows = await db.transaction.findMany({
    where: { profileId },
    orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      occurredOn: true,
      description: true,
      amountCents: true,
      status: true,
      importBatchId: true,
      account: { select: { name: true, currency: true } },
      category: { select: { name: true } },
    },
  });
  return transactionsCsv(
    rows.map((row) => ({
      id: row.id,
      occurredOn: row.occurredOn,
      description: row.description,
      amountCents: row.amountCents,
      currency: row.account.currency,
      accountName: row.account.name,
      categoryName: row.category?.name ?? null,
      status: row.status,
      importBatchId: row.importBatchId,
    })),
  );
}

export function exportFileName(kind: 'json' | 'csv', now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return kind === 'json' ? `talentum-dados-${day}.json` : `talentum-lancamentos-${day}.csv`;
}
