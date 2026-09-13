import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { inspectStatement, previewOf } from '@/server/import/inspect';
import { findSavedMapping } from '@/server/import/mapping-profiles';
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

  /* Mapeamento salvo para este layout.

     A busca só acontece quando a pessoa ainda não informou um mapeamento: uma
     escolha explícita na tela sempre vence o que está guardado. A segunda
     leitura é o preço de manter `inspectStatement` puro, sem acesso ao banco —
     e o arquivo é pequeno e limitado por teto. */
  let appliedMapping: Awaited<ReturnType<typeof findSavedMapping>> = null;
  if (!upload.mapping) {
    appliedMapping = await findSavedMapping(guarded.profileId, inspection.headerSignature);
    if (appliedMapping) {
      try {
        inspection = inspectStatement(upload.bytes, {
          mapping: appliedMapping.mapping,
          dialect: { ...appliedMapping.dialect, ...upload.dialect },
        });
      } catch {
        // Layout mudou desde que o mapeamento foi salvo: volta para a
        // inferência em vez de recusar o arquivo.
        appliedMapping = null;
        inspection = inspectStatement(upload.bytes, { dialect: upload.dialect });
      }
    }
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
    // De onde veio o mapeamento mostrado: um layout reconhecido não pode ser
    // aplicado em silêncio, a tela precisa dizer que reaproveitou.
    mappingSource: upload.mapping ? 'informado' : appliedMapping ? 'salvo' : 'inferido',
    savedMapping: appliedMapping
      ? { id: appliedMapping.id, name: appliedMapping.name, institutionName: appliedMapping.institutionName }
      : null,
    canRememberMapping: inspection.format === 'csv' && inspection.headerSignature !== null,
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
