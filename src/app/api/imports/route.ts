import { z } from 'zod';
import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { inspectStatement } from '@/server/import/inspect';
import { ImportPersistError, isUniqueViolation, persistImport } from '@/server/import/persist';
import {
  CLIENT_ERROR_STATUS,
  IMPORT_ERROR_MESSAGES,
  readStatementUpload,
} from '@/server/import/request';

/* Lotes de importação.

   `GET` lista os lotes do perfil. `POST` grava um lote inteiro em uma única
   transação SQLite (docs/HOW-IT-WORKS.md): ou o arquivo entra todo, ou não
   entra nada. Um erro na metade não deixa lote parcialmente confirmado. */

const accountSchema = z.string().trim().min(1).max(64);

export async function GET(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const batches = await db.importBatch.findMany({
    where: { profileId: guarded.profileId },
    orderBy: { importedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      format: true,
      status: true,
      fileName: true,
      periodStart: true,
      periodEnd: true,
      rowCount: true,
      importedCount: true,
      duplicateCount: true,
      importedAt: true,
      account: { select: { id: true, name: true } },
      _count: { select: { issues: true } },
    },
  });

  return ok({
    hasProfile: true,
    batches: batches.map((batch) => ({
      id: batch.id,
      format: batch.format,
      status: batch.status,
      fileName: batch.fileName,
      periodStart: batch.periodStart?.toISOString() ?? null,
      periodEnd: batch.periodEnd?.toISOString() ?? null,
      rowCount: batch.rowCount,
      importedCount: batch.importedCount,
      duplicateCount: batch.duplicateCount,
      issueCount: batch._count.issues,
      importedAt: batch.importedAt.toISOString(),
      account: batch.account,
    })),
  });
}

export async function POST(request: Request) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  let upload;
  try {
    upload = await readStatementUpload(request);
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'UNSUPPORTED_FORMAT';
    return fail(code, IMPORT_ERROR_MESSAGES[code] ?? 'O arquivo não pôde ser lido.', CLIENT_ERROR_STATUS[code] ?? 400);
  }

  const parsedAccount = accountSchema.safeParse(upload.accountId);
  if (!parsedAccount.success) return fail('ACCOUNT_REQUIRED', 'É preciso escolher a conta de destino.', 400);
  const accountId = parsedAccount.data;

  let inspection;
  try {
    inspection = inspectStatement(upload.bytes, { mapping: upload.mapping, dialect: upload.dialect });
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'UNSUPPORTED_FORMAT';
    return fail(code, IMPORT_ERROR_MESSAGES[code] ?? 'O arquivo não pôde ser lido.', CLIENT_ERROR_STATUS[code] ?? 400);
  }

  try {
    const result = await persistImport(guarded.profileId, accountId, inspection, {
      originalName: upload.originalName,
      byteSize: upload.byteSize,
      mediaType: upload.mediaType,
    });

    return ok(
      {
        importBatchId: result.importBatchId,
        rowCount: result.rowCount,
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount,
        issueCount: result.issueCount,
        periodStart: result.periodStart?.toISOString() ?? null,
        periodEnd: result.periodEnd?.toISOString() ?? null,
        balanceRecorded: result.balanceRecorded,
      },
      201,
    );
  } catch (error) {
    if (error instanceof ImportPersistError) {
      return fail(
        error.code,
        IMPORT_ERROR_MESSAGES[error.code] ?? 'A importação não pôde ser concluída.',
        CLIENT_ERROR_STATUS[error.code] ?? 400,
      );
    }
    if (isUniqueViolation(error)) {
      return fail('DUPLICATE_BATCH', IMPORT_ERROR_MESSAGES.DUPLICATE_BATCH, 409);
    }
    // Erro inesperado não vira stack trace na resposta (docs/API.md).
    return fail('IMPORT_FAILED', 'A importação não pôde ser concluída.', 500);
  }
}
