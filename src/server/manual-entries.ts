/* Lançamento manual em dinheiro.

   MVP 5 de docs/ROADMAP.md: gasto ou entrada em espécie não aparece em extrato
   nenhum, então a pessoa registra à mão. Regras que este módulo mantém:

   - só em conta do tipo `cash`: lançar à mão numa conta bancária duplicaria o
     lançamento quando o extrato daquela conta fosse importado;
   - **idempotente**: o cliente gera a chave uma vez por formulário, e reenviar o
     mesmo pedido devolve o lançamento já gravado; a mesma chave com outro
     conteúdo é recusada;
   - **reversível**: o evento do histórico desfaz o lançamento, e o lançamento
     sem categoria entra na conciliação como qualquer outro.

   Toda consulta é escopada por `profileId` (docs/DATABASE.md, §4). */

import { db } from '@/server/db';
import { loadActiveRules, loadOwnPixIndexes, mentionsOwnPix, planNewEntries, writeReconciliation } from '@/server/auto-reconciliation';
import { prismaErrorKind } from '@/server/prisma-errors';

export type ManualEntryErrorCode =
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_NOT_CASH'
  | 'CATEGORY_NOT_FOUND'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'MANUAL_ENTRY_NOT_FOUND'
  | 'MANUAL_ENTRY_PAIRED';

export class ManualEntryError extends Error {
  constructor(readonly code: ManualEntryErrorCode) { super(code); }
}

export type ManualEntryInput = {
  accountId: string;
  /** Meia-noite local do dia civil; hoje usa o instante do envio, para ficar depois do saldo informado hoje. */
  occurredOn: Date;
  description: string;
  amountCents: bigint;
  categoryId: string | null;
  idempotencyKey: string;
};

const selectEntry = { id: true, accountId: true, occurredOn: true, description: true, amountCents: true, categoryId: true } as const;

type StoredEntry = { id: string; accountId: string; occurredOn: Date; description: string; amountCents: bigint; categoryId: string | null };

/* O dia civil, não o instante: o lançamento de hoje grava a hora do envio, e o
   reenvio chega segundos depois com o mesmo dia. */
const civilDay = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function sameRequest(stored: StoredEntry, input: ManualEntryInput): boolean {
  return stored.accountId === input.accountId
    && civilDay(stored.occurredOn) === civilDay(input.occurredOn)
    && stored.description === input.description
    && stored.amountCents === input.amountCents
    && stored.categoryId === input.categoryId;
}

async function replay(profileId: string, input: ManualEntryInput) {
  const stored = await db.transaction.findFirst({ where: { profileId, idempotencyKey: input.idempotencyKey }, select: selectEntry });
  if (!stored) return null;
  // A mesma chave com outro conteúdo é erro do cliente, nunca uma segunda gravação.
  if (!sameRequest(stored, input)) throw new ManualEntryError('IDEMPOTENCY_KEY_REUSED');
  const event = await db.timelineEvent.findFirst({ where: { profileId, transactionId: stored.id, kind: 'manual_entry' }, select: { id: true } });
  return { transactionId: stored.id, timelineEventId: event?.id ?? null, created: false };
}

export type ManualEntryResult = { transactionId: string; timelineEventId: string | null; created: boolean };

export async function createManualEntry(profileId: string, input: ManualEntryInput): Promise<ManualEntryResult> {
  const previous = await replay(profileId, input);
  if (previous) return previous;

  const account = await db.account.findFirst({ where: { id: input.accountId, profileId, isActive: true }, select: { id: true, type: true } });
  if (!account) throw new ManualEntryError('ACCOUNT_NOT_FOUND');
  if (account.type !== 'cash') throw new ManualEntryError('ACCOUNT_NOT_CASH');
  if (input.categoryId) {
    const category = await db.category.findFirst({ where: { id: input.categoryId, profileId }, select: { id: true } });
    if (!category) throw new ManualEntryError('CATEGORY_NOT_FOUND');
  }

  const [rules, indexes] = input.categoryId ? [[], new Set<string>()] as const : await Promise.all([loadActiveRules(profileId), loadOwnPixIndexes(profileId)]);
  const ownPix = await mentionsOwnPix(input.description, indexes);

  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          profileId,
          accountId: account.id,
          categoryId: input.categoryId,
          occurredOn: input.occurredOn,
          description: input.description,
          amountCents: input.amountCents,
          // A pessoa registrou o que já aconteceu: o lançamento entra liquidado.
          status: 'posted',
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      });

      // Sem categoria, o lançamento segue o mesmo caminho do extrato: regra,
      // transferência provável ou fila de conciliação.
      if (!input.categoryId) {
        const plan = await planNewEntries(tx, profileId, [{ id: created.id, accountId: account.id, occurredOn: input.occurredOn, amountCents: input.amountCents, description: input.description, mentionsOwnPix: ownPix }], { rules, indexes });
        const categoryId = plan.entries[0]?.categoryId ?? null;
        if (categoryId) await tx.transaction.updateMany({ where: { id: created.id, profileId }, data: { categoryId } });
        await writeReconciliation(tx, profileId, plan, new Map([[created.id, { amountCents: input.amountCents, status: 'posted' }]]));
      }

      const event = await tx.timelineEvent.create({
        data: {
          profileId,
          kind: 'manual_entry',
          title: 'Lançamento em dinheiro registrado',
          description: input.amountCents < 0n ? 'Um gasto em dinheiro foi registrado à mão.' : 'Uma entrada em dinheiro foi registrada à mão.',
          transactionId: created.id,
          reversible: true,
        },
        select: { id: true },
      });
      return { transactionId: created.id, timelineEventId: event.id, created: true };
    });
  } catch (error) {
    // Dois envios simultâneos com a mesma chave: o índice único decide, e quem
    // perdeu devolve o lançamento de quem venceu.
    if (prismaErrorKind(error) === 'conflict') {
      const winner = await replay(profileId, input);
      if (winner) return winner;
    }
    throw error;
  }
}

/**
 * Desfaz um lançamento manual.
 *
 * Só apaga lançamento criado à mão (sem lote de importação, com chave de
 * idempotência). Um lançamento já pareado como transferência é recusado: a
 * outra ponta perderia o par sem aviso. Desfaça a conciliação primeiro.
 */
export async function revertManualEntry(profileId: string, transactionId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const entry = await tx.transaction.findFirst({
      where: { id: transactionId, profileId, importBatchId: null, idempotencyKey: { not: null } },
      select: { id: true, _count: { select: { outgoingTransfers: true, incomingTransfers: true } } },
    });
    if (!entry) throw new ManualEntryError('MANUAL_ENTRY_NOT_FOUND');
    if (entry._count.outgoingTransfers + entry._count.incomingTransfers > 0) throw new ManualEntryError('MANUAL_ENTRY_PAIRED');
    const removed = await tx.transaction.deleteMany({ where: { id: entry.id, profileId, importBatchId: null } });
    if (removed.count !== 1) throw new ManualEntryError('MANUAL_ENTRY_NOT_FOUND');
  });
}
