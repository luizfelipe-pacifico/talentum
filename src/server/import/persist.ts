/* Gravação do lote de importação.

   Este é o único módulo do importador que toca o banco. Ele recebe uma inspeção
   já validada e grava tudo em uma única transação SQLite: lote, arquivo,
   lançamentos, problemas e saldo. `docs/HOW-IT-WORKS.md` exige persistência
   atômica e rastreabilidade entre arquivo, lote e lançamentos; um erro na
   metade não pode deixar um lote parcialmente confirmado.

   Toda consulta é escopada por `profileId` (docs/ESTRUTURA_DE_DADOS.md, §4). */

import { Prisma } from '@prisma/client';
import { db } from '@/server/db';
import type { RawEntry } from './csv.ts';
import type { StatementInspection } from './inspect.ts';

export type ImportPersistErrorCode = 'DUPLICATE_BATCH' | 'ACCOUNT_NOT_FOUND' | 'NOTHING_TO_IMPORT';

export class ImportPersistError extends Error {
  readonly code: ImportPersistErrorCode;
  readonly detail?: { importBatchId?: string };

  constructor(code: ImportPersistErrorCode, detail?: { importBatchId?: string }) {
    super(code);
    this.name = 'ImportPersistError';
    this.code = code;
    this.detail = detail;
  }
}

export type ImportFileMeta = {
  originalName: string;
  byteSize: number;
  mediaType: string;
};

export type ImportResult = {
  importBatchId: string;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  issueCount: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  balanceRecorded: boolean;
};

/**
 * Chave de comparação para lançamento sem identificador de origem.
 *
 * Alguns bancos não exportam identificador. Nesse caso a igualdade é aferida
 * por dia civil, valor e descrição — os três campos que o extrato garante.
 */
function fallbackKey(entry: { occurredOn: Date; amountCents: bigint; description: string }): string {
  return `${entry.occurredOn.getTime()}|${entry.amountCents}|${entry.description}`;
}

/** Remove separadores de caminho do nome original: ele é rótulo, nunca caminho. */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001F<>:"|?*]/g, '');
  const trimmed = base.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 160) : 'extrato';
}

/**
 * Grava o lote.
 *
 * Deduplicação em dois níveis, porque os dois erros acontecem na prática:
 *
 * 1. o mesmo arquivo reenviado — barrado pela impressão digital do lote;
 * 2. dois extratos com período sobreposto — barrado lançamento a lançamento,
 *    pelo identificador de origem ou, na falta dele, pela chave de comparação.
 */
export async function persistImport(
  profileId: string,
  accountId: string,
  inspection: StatementInspection,
  file: ImportFileMeta,
): Promise<ImportResult> {
  const account = await db.account.findFirst({
    where: { id: accountId, profileId },
    select: { id: true },
  });
  if (!account) throw new ImportPersistError('ACCOUNT_NOT_FOUND');

  const existingBatch = await db.importBatch.findFirst({
    where: { profileId, fingerprint: inspection.fingerprint },
    select: { id: true },
  });
  if (existingBatch) throw new ImportPersistError('DUPLICATE_BATCH', { importBatchId: existingBatch.id });

  if (inspection.entries.length === 0) throw new ImportPersistError('NOTHING_TO_IMPORT');

  const periodStart = inspection.periodStart;
  const periodEnd = inspection.periodEnd;

  // Só os lançamentos do intervalo do arquivo precisam ser comparados: buscar a
  // conta inteira leria o histórico completo a cada importação.
  const existing = await db.transaction.findMany({
    where: {
      profileId,
      accountId,
      ...(periodStart && periodEnd ? { occurredOn: { gte: periodStart, lte: periodEnd } } : {}),
    },
    select: { externalId: true, occurredOn: true, amountCents: true, description: true },
  });

  const existingExternalIds = new Set(
    existing.map((row) => row.externalId).filter((value): value is string => value !== null),
  );
  const fallbackCounts = new Map<string, number>();
  for (const row of existing) {
    if (row.externalId) continue;
    const key = fallbackKey(row);
    fallbackCounts.set(key, (fallbackCounts.get(key) ?? 0) + 1);
  }

  const fresh: RawEntry[] = [];
  const seenExternalIds = new Set<string>();
  let duplicateCount = 0;

  for (const entry of inspection.entries) {
    if (entry.externalId) {
      // Repetido no banco ou repetido dentro do próprio arquivo.
      if (existingExternalIds.has(entry.externalId) || seenExternalIds.has(entry.externalId)) {
        duplicateCount += 1;
        continue;
      }
      seenExternalIds.add(entry.externalId);
      fresh.push(entry);
      continue;
    }

    const key = fallbackKey(entry);
    const remaining = fallbackCounts.get(key) ?? 0;
    if (remaining > 0) {
      // Consome uma ocorrência: dois lançamentos idênticos legítimos no mesmo
      // dia continuam sendo dois, desde que já não existam os dois no banco.
      fallbackCounts.set(key, remaining - 1);
      duplicateCount += 1;
      continue;
    }
    fresh.push(entry);
  }

  const now = new Date();

  return db.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        profileId,
        accountId,
        format: inspection.format,
        fingerprint: inspection.fingerprint,
        status: 'completed',
        fileName: sanitizeFileName(file.originalName),
        periodStart,
        periodEnd,
        rowCount: inspection.entries.length,
        importedCount: fresh.length,
        duplicateCount,
        importedAt: now,
      },
      select: { id: true },
    });

    await tx.importFile.create({
      data: {
        importBatchId: batch.id,
        originalName: sanitizeFileName(file.originalName),
        byteSize: file.byteSize,
        contentHash: inspection.fingerprint,
        mediaType: file.mediaType,
        encoding: inspection.encoding,
      },
    });

    if (fresh.length > 0) {
      await tx.transaction.createMany({
        data: fresh.map((entry) => ({
          profileId,
          accountId,
          importBatchId: batch.id,
          categoryId: null,
          occurredOn: entry.occurredOn,
          description: entry.description,
          amountCents: entry.amountCents,
          // Um lançamento de extrato já aconteceu: ele entra como liquidado.
          // `pending` é a fila de conciliação, que nasce na migration 6.
          status: 'posted',
          externalId: entry.externalId,
        })),
      });
    }

    if (inspection.issues.length > 0) {
      await tx.importIssue.createMany({
        data: inspection.issues.map((issue) => ({
          importBatchId: batch.id,
          lineNumber: issue.lineNumber,
          severity: issue.severity,
          code: issue.code,
          message: issue.message,
        })),
      });
    }

    let balanceRecorded = false;
    if (inspection.closingBalance) {
      // O saldo informado pelo extrato é o saldo conhecido da conta naquela
      // data. Sem ele o painel trataria a conta como "saldo desconhecido".
      await tx.balanceSnapshot.create({
        data: {
          accountId,
          balanceCents: inspection.closingBalance.cents,
          capturedAt: inspection.closingBalance.capturedAt,
          importBatchId: batch.id,
        },
      });
      balanceRecorded = true;
    }

    return {
      importBatchId: batch.id,
      rowCount: inspection.entries.length,
      importedCount: fresh.length,
      duplicateCount,
      issueCount: inspection.issues.length,
      periodStart,
      periodEnd,
      balanceRecorded,
    };
  });
}

/**
 * Desfaz um lote.
 *
 * Remove os lançamentos originados nele e o próprio lote. O saldo gravado pela
 * importação também sai: mantê-lo deixaria o painel com um saldo cuja origem
 * foi apagada. A operação é escopada por perfil e atômica.
 */
export async function revertImport(profileId: string, importBatchId: string): Promise<{ removed: number }> {
  const batch = await db.importBatch.findFirst({
    where: { id: importBatchId, profileId },
    select: { id: true },
  });
  if (!batch) throw new ImportPersistError('ACCOUNT_NOT_FOUND');

  return db.$transaction(async (tx) => {
    const removed = await tx.transaction.deleteMany({ where: { profileId, importBatchId: batch.id } });

    // Apaga exatamente o saldo que esta importação gravou. Um saldo informado à
    // mão depois dela não tem `importBatchId` e permanece.
    await tx.balanceSnapshot.deleteMany({ where: { importBatchId: batch.id } });

    await tx.importBatch.delete({ where: { id: batch.id } });
    return { removed: removed.count };
  });
}

/** Traduz erro de unicidade do Prisma em duplicidade de lote. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
