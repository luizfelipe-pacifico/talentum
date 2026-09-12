import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { ImportPersistError, revertImport } from '@/server/import/persist';

/* Detalhe e reversão de um lote.

   `docs/HOW-IT-WORKS.md` exige permitir desfazer o lote sem afetar alterações
   posteriores não relacionadas. A reversão remove apenas os lançamentos que
   nasceram deste lote e o saldo que a própria importação gravou. */

type Context = { params: Promise<{ importBatchId: string }> };

export async function GET(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { importBatchId } = await context.params;

  const batch = await db.importBatch.findFirst({
    // Escopo por perfil: um ID opaco não é autorização.
    where: { id: importBatchId, profileId: guarded.profileId },
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
      files: { select: { originalName: true, byteSize: true, mediaType: true, encoding: true } },
      issues: {
        orderBy: { lineNumber: 'asc' },
        take: 200,
        select: { lineNumber: true, severity: true, code: true, message: true },
      },
    },
  });

  if (!batch) return fail('IMPORT_NOT_FOUND', 'O lote informado não existe.', 404);

  return ok({
    hasProfile: true,
    batch: {
      id: batch.id,
      format: batch.format,
      status: batch.status,
      fileName: batch.fileName,
      periodStart: batch.periodStart?.toISOString() ?? null,
      periodEnd: batch.periodEnd?.toISOString() ?? null,
      rowCount: batch.rowCount,
      importedCount: batch.importedCount,
      duplicateCount: batch.duplicateCount,
      importedAt: batch.importedAt.toISOString(),
      account: batch.account,
      // Metadados do arquivo, nunca o conteúdo: o extrato não é retido.
      file: batch.files[0] ?? null,
      issues: batch.issues,
    },
  });
}

export async function DELETE(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { importBatchId } = await context.params;

  try {
    const result = await revertImport(guarded.profileId, importBatchId);
    return ok({ reverted: true, removedTransactions: result.removed });
  } catch (error) {
    if (error instanceof ImportPersistError) return fail('IMPORT_NOT_FOUND', 'O lote informado não existe.', 404);
    return fail('REVERT_FAILED', 'O lote não pôde ser revertido.', 500);
  }
}
