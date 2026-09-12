import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { inspectStatement, previewOf } from '@/server/import/inspect';
import {
  CLIENT_ERROR_STATUS,
  IMPORT_ERROR_MESSAGES,
  readStatementUpload,
} from '@/server/import/request';

/* Inspeção do extrato: prévia sem gravar nada.

   Feature 4 de docs/ROUTING_MVP.md, passos 2 a 5: validar o arquivo, calcular a
   impressão digital, detectar o dialeto, propor o mapeamento e mostrar a prévia
   — tudo antes de qualquer escrita. É seguro chamar de novo a cada ajuste que a
   pessoa fizer no mapeamento. */

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

  let inspection;
  try {
    inspection = inspectStatement(upload.bytes, { mapping: upload.mapping, dialect: upload.dialect });
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'UNSUPPORTED_FORMAT';
    return fail(code, IMPORT_ERROR_MESSAGES[code] ?? 'O arquivo não pôde ser lido.', CLIENT_ERROR_STATUS[code] ?? 400);
  }

  // Arquivo já importado antes: dizer isso agora evita que a pessoa chegue ao
  // fim do fluxo para receber uma recusa.
  const duplicate = await db.importBatch.findFirst({
    where: { profileId: guarded.profileId, fingerprint: inspection.fingerprint },
    select: { id: true, fileName: true, importedAt: true },
  });

  const accounts = await db.account.findMany({
    where: { profileId: guarded.profileId, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, currency: true, institution: { select: { name: true } } },
  });

  return ok({
    hasProfile: true,
    format: inspection.format,
    encoding: inspection.encoding,
    repairedEncoding: inspection.repairedEncoding,
    fingerprint: inspection.fingerprint,
    dialect: inspection.dialect,
    headers: inspection.headers,
    mapping: inspection.mapping,
    rowCount: inspection.entries.length,
    issueCount: inspection.issues.length,
    duplicateExternalIds: inspection.duplicateExternalIds,
    periodStart: inspection.periodStart?.toISOString() ?? null,
    periodEnd: inspection.periodEnd?.toISOString() ?? null,
    closingBalanceCents: inspection.closingBalance ? inspection.closingBalance.cents.toString() : null,
    closingBalanceAt: inspection.closingBalance ? inspection.closingBalance.capturedAt.toISOString() : null,
    declaredAccount: inspection.declaredAccount,
    currency: inspection.currency,
    preview: previewOf(inspection),
    // Os problemas vão resumidos por código: a lista completa pertence ao lote
    // gravado, não à prévia.
    issues: inspection.issues.slice(0, 20),
    alreadyImported: duplicate
      ? { importBatchId: duplicate.id, fileName: duplicate.fileName, importedAt: duplicate.importedAt.toISOString() }
      : null,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      institutionName: account.institution?.name ?? null,
    })),
  });
}
