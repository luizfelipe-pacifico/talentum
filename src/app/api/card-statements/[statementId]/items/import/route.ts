import { db } from '@/server/db';
import { fail, guardWithProfile, isDenied, ok } from '@/server/http';
import { cardItemsFromEntries } from '@/server/cards';
import { findStatement } from '@/server/card-store';
import { inspectStatementFile } from '@/server/import/inspect-file';
import { CLIENT_ERROR_STATUS, IMPORT_ERROR_MESSAGES, readStatementUpload } from '@/server/import/request';

/* Importar os itens de uma fatura a partir de arquivo (CSV, OFX ou PDF).

   Mesmo pipeline defensivo da importação de extrato (docs/SECURITY.md,
   Statement import): o formato vem do conteúdo, os tetos valem antes de ler, e
   o arquivo não é retido. A prévia é feita antes por `POST /api/imports/inspect`,
   que não grava nada; esta rota grava.

   Idempotente: cada item recebe uma chave derivada de dia, valor, descrição e
   ordem da ocorrência no arquivo (`cardItemsFromEntries`). Importar o mesmo
   arquivo de novo não cria item novo; o total de repetidos volta na resposta.
   Linhas lidas de PDF com confiança abaixo do mínimo não entram (ADR 0006). */

type Context = { params: Promise<{ statementId: string }> };

export async function POST(request: Request, context: Context) {
  const guarded = await guardWithProfile(request);
  if (isDenied(guarded)) return guarded.response;

  const { statementId } = await context.params;
  const statement = await findStatement(guarded.profileId, statementId);
  if (!statement) return fail('STATEMENT_NOT_FOUND', 'A fatura informada não existe.', 404);

  let upload;
  try {
    upload = await readStatementUpload(request);
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'UNSUPPORTED_FORMAT';
    return fail(code, IMPORT_ERROR_MESSAGES[code] ?? 'O arquivo não pôde ser lido.', CLIENT_ERROR_STATUS[code] ?? 400);
  }

  let inspection;
  try {
    inspection = await inspectStatementFile(upload.bytes, { mapping: upload.mapping, dialect: upload.dialect });
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'UNSUPPORTED_FORMAT';
    return fail(code, IMPORT_ERROR_MESSAGES[code] ?? 'O arquivo não pôde ser lido.', CLIENT_ERROR_STATUS[code] ?? 400);
  }

  const drafts = cardItemsFromEntries(inspection.entries);
  if (drafts.length === 0) return fail('NOTHING_TO_IMPORT', IMPORT_ERROR_MESSAGES.NOTHING_TO_IMPORT, 400);

  const existing = await db.cardStatementItem.findMany({
    where: {
      cardStatementId: statement.id,
      profileId: guarded.profileId,
      externalId: { in: drafts.map((draft) => draft.externalId) },
    },
    select: { externalId: true },
  });
  const known = new Set(existing.map((row) => row.externalId));
  const fresh = drafts.filter((draft) => !known.has(draft.externalId));

  if (fresh.length > 0) {
    await db.$transaction(async (tx) => {
      // Uma requisição concorrente pode ter gravado parte destes itens entre a
      // leitura e aqui; regravar a lista dentro da transação evita o conflito.
      const raced = await tx.cardStatementItem.findMany({
        where: { profileId: guarded.profileId, cardStatementId: statement.id, externalId: { in: fresh.map((draft) => draft.externalId) } },
        select: { externalId: true },
      });
      const racedKeys = new Set(raced.map((row) => row.externalId));
      const data = fresh
        .filter((draft) => !racedKeys.has(draft.externalId))
        .map((draft) => ({
          profileId: guarded.profileId,
          cardStatementId: statement.id,
          occurredOn: draft.occurredOn,
          description: draft.description,
          amountCents: draft.amountCents,
          installmentNumber: draft.installmentNumber,
          installmentCount: draft.installmentCount,
          source: 'import',
          externalId: draft.externalId,
        }));
      if (data.length > 0) await tx.cardStatementItem.createMany({ data });
    });
  }

  return ok(
    {
      format: inspection.format,
      readCount: drafts.length,
      importedCount: fresh.length,
      duplicateCount: drafts.length - fresh.length,
      issueCount: inspection.issues.length,
      lowConfidenceCount: inspection.pdf?.lowConfidenceCount ?? 0,
      // O total que o próprio documento declara, para comparar com o da fatura.
      declaredTotalCents: inspection.pdf?.declared.totalCents?.toString() ?? null,
    },
    201,
  );
}
