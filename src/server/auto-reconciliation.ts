/* Gravação da conciliação automática.

   Lê o que o plano (src/server/reconciliation-plan.ts) precisa, dentro da
   transação de quem chama, e grava itens, decisões de regra e marcas de par
   provável. Toda consulta é escopada por `profileId` (docs/DATABASE.md, §4).

   Duas garantias que este módulo mantém:

   - **Categoria escolhida à mão nunca é sobrescrita.** Só lançamento sem
     categoria entra no plano, e a reaplicação grava com a condição
     `categoryId: null` na própria escrita.
   - **Toda aplicação automática é auditável e reversível.** A regra aplicada
     gera uma `ReconciliationDecision` do tipo `rule`, com o antes e o depois,
     revertida pelo mesmo caminho das decisões manuais. */

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { categorize, type MatchType, type MerchantRuleInput } from '@/server/categorization';
import { db } from '@/server/db';
import { pixIndexOf } from '@/server/pix';
import { planReconciliation, type NewEntry, type PlannedEntry, type PoolEntry } from '@/server/reconciliation-plan';
import { pixKeyCandidates, TRANSFER_WINDOW_DAYS } from '@/server/transfer-detection';

type Client = Prisma.TransactionClient | typeof db;

const DAY_MS = 86_400_000;

export async function loadActiveRules(profileId: string, client: Client = db): Promise<MerchantRuleInput[]> {
  const rules = await client.merchantRule.findMany({
    where: { profileId, isActive: true },
    select: { id: true, categoryId: true, pattern: true, matchType: true, priority: true },
  });
  return rules.map((rule) => ({ ...rule, matchType: rule.matchType as MatchType }));
}

/** Índices HMAC das chaves PIX próprias ativas. Vazio quando não há chave. */
export async function loadOwnPixIndexes(profileId: string, client: Client = db): Promise<Set<string>> {
  const rows = await client.pixIdentifier.findMany({ where: { profileId, isActive: true }, select: { valueIndex: true } });
  return new Set(rows.map((row) => row.valueIndex));
}

/**
 * A descrição cita uma chave PIX da própria pessoa?
 *
 * Calcula o índice HMAC de cada trecho com forma de chave e confere no conjunto.
 * O trecho em claro não sai desta função: não é gravado, nem logado. Sem chave
 * cadastrada, nem deriva a chave do dispositivo.
 */
export async function mentionsOwnPix(description: string, indexes: ReadonlySet<string>): Promise<boolean> {
  if (indexes.size === 0) return false;
  for (const candidate of pixKeyCandidates(description)) {
    if (indexes.has(await pixIndexOf(candidate.type, candidate.normalized))) return true;
  }
  return false;
}

/**
 * Lançamentos já gravados que podem ser a outra ponta de uma transferência.
 *
 * Só outras contas da pessoa, na janela de datas dos lançamentos novos, ainda
 * sem par registrado. O valor oposto é conferido depois, em memória.
 */
export async function loadTransferPool(
  tx: Client,
  profileId: string,
  entries: readonly Pick<NewEntry, 'accountId' | 'occurredOn' | 'amountCents'>[],
  indexes: ReadonlySet<string>,
): Promise<PoolEntry[]> {
  if (entries.length === 0) return [];
  const times = entries.map((entry) => entry.occurredOn.getTime());
  const from = new Date(Math.min(...times) - (TRANSFER_WINDOW_DAYS + 1) * DAY_MS);
  const to = new Date(Math.max(...times) + (TRANSFER_WINDOW_DAYS + 1) * DAY_MS);
  const accounts = [...new Set(entries.map((entry) => entry.accountId))];
  const opposite = new Set(entries.map((entry) => (-entry.amountCents).toString()));

  const rows = await tx.transaction.findMany({
    where: {
      profileId,
      accountId: { notIn: accounts },
      occurredOn: { gte: from, lte: to },
      outgoingTransfers: { none: {} },
      incomingTransfers: { none: {} },
    },
    select: { id: true, accountId: true, occurredOn: true, amountCents: true, description: true, categoryId: true, reconciliationItem: { select: { status: true } } },
  });

  const pool: PoolEntry[] = [];
  for (const row of rows) {
    if (!opposite.has(row.amountCents.toString())) continue;
    pool.push({
      id: row.id,
      accountId: row.accountId,
      occurredOn: row.occurredOn,
      amountCents: row.amountCents,
      mentionsOwnPix: await mentionsOwnPix(row.description, indexes),
      pending: row.categoryId === null && row.reconciliationItem?.status === 'pending',
    });
  }
  return pool;
}

type Snapshot = { entity: 'transaction'; transactionId: string; categoryId: string | null; amountCents: string; status: string };

/**
 * Grava itens, decisões de regra e marcas de par provável.
 *
 * `amounts` traz valor e estado de cada lançamento, para o antes e o depois da
 * decisão: o mesmo formato que src/server/reconciliation.ts restaura.
 */
export async function writeReconciliation(
  tx: Prisma.TransactionClient,
  profileId: string,
  plan: { entries: PlannedEntry[]; counterparts: { transactionId: string; confidence: number }[] },
  amounts: ReadonlyMap<string, { amountCents: bigint; status: string }>,
): Promise<{ autoCategorized: number; transferSuggestions: number }> {
  const items = plan.entries.map((entry) => ({ ...entry, itemId: randomUUID() }));
  if (items.length > 0) {
    await tx.reconciliationItem.createMany({
      data: items.map((entry) => ({
        id: entry.itemId,
        profileId,
        transactionId: entry.id,
        reason: entry.item.reason,
        confidence: entry.item.confidence,
        status: entry.item.status,
      })),
    });
  }

  const applied = items.filter((entry) => entry.categoryId !== null && entry.ruleId !== null);
  if (applied.length > 0) {
    await tx.reconciliationDecision.createMany({
      data: applied.map((entry) => {
        const value = amounts.get(entry.id) ?? { amountCents: 0n, status: 'posted' };
        const before: Snapshot = { entity: 'transaction', transactionId: entry.id, categoryId: null, amountCents: value.amountCents.toString(), status: value.status };
        const after: Snapshot = { ...before, categoryId: entry.categoryId };
        return { profileId, reconciliationItemId: entry.itemId, kind: 'rule', beforeJson: JSON.stringify([before]), afterJson: JSON.stringify([after]) };
      }),
    });
  }

  for (const counterpart of plan.counterparts) {
    await tx.reconciliationItem.updateMany({
      where: { profileId, transactionId: counterpart.transactionId, status: 'pending' },
      data: { reason: 'own_transfer_candidate', confidence: counterpart.confidence },
    });
  }

  return {
    autoCategorized: applied.length,
    transferSuggestions: items.filter((entry) => entry.item.reason === 'own_transfer_candidate').length,
  };
}

/** Plano completo para lançamentos novos: pool, chaves PIX e regras. */
export async function planNewEntries(
  tx: Prisma.TransactionClient,
  profileId: string,
  entries: readonly NewEntry[],
  context: { rules: readonly MerchantRuleInput[]; indexes: ReadonlySet<string> },
) {
  const pool = await loadTransferPool(tx, profileId, entries, context.indexes);
  return planReconciliation(entries, pool, context.rules);
}

export type ReapplyResult = { applied: number; suggested: number; conflicts: number };

/**
 * Reaplica as regras ativas aos itens que ainda aguardam categoria.
 *
 * Entram só itens pendentes sem categoria, cujo motivo é falta de categoria ou
 * sugestão/conflito de regra, e que nunca tiveram uma decisão de regra: se a
 * pessoa desfez uma regra naquele lançamento, ela não volta sozinha. Par
 * provável de transferência fica de fora, pelo mesmo motivo do plano.
 */
export async function reapplyRules(profileId: string): Promise<ReapplyResult> {
  return db.$transaction(async (tx) => {
    const rules = await loadActiveRules(profileId, tx);
    const result: ReapplyResult = { applied: 0, suggested: 0, conflicts: 0 };
    if (rules.length === 0) return result;

    const items = await tx.reconciliationItem.findMany({
      where: {
        profileId,
        status: 'pending',
        reason: { in: ['category_unknown', 'merchant_rule_suggestion', 'merchant_rule_conflict'] },
        decisions: { none: { kind: 'rule' } },
        transaction: { categoryId: null },
      },
      take: 5_000,
      select: { id: true, reason: true, confidence: true, transaction: { select: { id: true, description: true, amountCents: true, status: true } } },
    });

    for (const item of items) {
      const outcome = categorize(item.transaction.description, rules);
      if (outcome.kind === 'apply') {
        // A condição `categoryId: null` está na escrita: uma categoria escolhida
        // à mão entre a leitura e aqui nunca é sobrescrita.
        const written = await tx.transaction.updateMany({ where: { id: item.transaction.id, profileId, categoryId: null }, data: { categoryId: outcome.categoryId, status: 'posted' } });
        if (written.count !== 1) continue;
        const claimed = await tx.reconciliationItem.updateMany({ where: { id: item.id, profileId, status: 'pending' }, data: { status: 'resolved', reason: outcome.reason, confidence: outcome.confidence } });
        if (claimed.count !== 1) continue;
        const before: Snapshot = { entity: 'transaction', transactionId: item.transaction.id, categoryId: null, amountCents: item.transaction.amountCents.toString(), status: item.transaction.status };
        await tx.reconciliationDecision.create({ data: { profileId, reconciliationItemId: item.id, kind: 'rule', beforeJson: JSON.stringify([before]), afterJson: JSON.stringify([{ ...before, categoryId: outcome.categoryId, status: 'posted' }]) } });
        result.applied += 1;
        continue;
      }
      if (outcome.reason !== item.reason || outcome.confidence !== item.confidence) {
        await tx.reconciliationItem.updateMany({ where: { id: item.id, profileId, status: 'pending' }, data: { reason: outcome.reason, confidence: outcome.confidence } });
      }
      if (outcome.kind === 'suggest') result.suggested += 1;
      if (outcome.kind === 'conflict') result.conflicts += 1;
    }

    if (result.applied > 0) {
      await tx.timelineEvent.create({ data: { profileId, kind: 'categorization', title: 'Regras de categoria aplicadas', description: `${result.applied} lançamento(s) categorizado(s) por regra. Cada um pode ser desfeito na conciliação.`, reversible: false } });
    }
    return result;
  }, { timeout: 30_000 });
}
