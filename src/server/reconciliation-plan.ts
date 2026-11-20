/* Plano de conciliação de lançamentos novos.

   Junta as duas detecções automáticas numa ordem fixa, pura e testável:

   1. **Transferência própria primeiro.** Um par provável vai para a fila como
      transferência, mesmo que uma regra de estabelecimento case com a
      descrição: categorizá-lo como gasto inflaria os agregados, exatamente o
      erro da lacuna L-5 de docs/PRODUCT.md.
   2. **Regra de estabelecimento depois**, com a política de
      src/server/categorization.ts: aplicada na hora quando a confiança é alta,
      sugestão na fila quando não é.
   3. Sem nenhuma das duas, o item nasce como hoje: `category_unknown`, 0.

   O plano não escreve nada; quem grava é src/server/auto-reconciliation.ts. */

import { categorize, type MerchantRuleInput } from './categorization.ts';
import { TRANSFER_SUGGESTION_CONFIDENCE, transferCandidates, type TransferEntry } from './transfer-detection.ts';

export type NewEntry = TransferEntry & { description: string };

/** Lançamento já gravado que pode ser a outra ponta de uma transferência. */
export type PoolEntry = TransferEntry & {
  /** Ainda sem categoria e sem decisão: pode receber a marca de par provável. */
  pending: boolean;
};

export type PlannedEntry = {
  id: string;
  /** Categoria gravada no lançamento. Só existe quando a regra foi aplicada. */
  categoryId: string | null;
  ruleId: string | null;
  item: { status: 'pending' | 'resolved'; reason: string; confidence: number };
};

export type ReconciliationPlan = {
  entries: PlannedEntry[];
  /** Itens pendentes já gravados que passam a apontar transferência provável. */
  counterparts: { transactionId: string; confidence: number }[];
};

export function planReconciliation(
  entries: readonly NewEntry[],
  pool: readonly PoolEntry[],
  rules: readonly MerchantRuleInput[],
): ReconciliationPlan {
  const planned: PlannedEntry[] = [];
  const counterparts = new Map<string, number>();
  const eligible = pool.filter((entry) => entry.pending);

  for (const entry of entries) {
    const [best] = transferCandidates(entry, eligible);
    if (best && best.confidence >= TRANSFER_SUGGESTION_CONFIDENCE) {
      planned.push({ id: entry.id, categoryId: null, ruleId: null, item: { status: 'pending', reason: 'own_transfer_candidate', confidence: best.confidence } });
      counterparts.set(best.transactionId, Math.max(counterparts.get(best.transactionId) ?? 0, best.confidence));
      continue;
    }

    const outcome = categorize(entry.description, rules);
    if (outcome.kind === 'apply') {
      planned.push({ id: entry.id, categoryId: outcome.categoryId, ruleId: outcome.ruleId, item: { status: 'resolved', reason: outcome.reason, confidence: outcome.confidence } });
    } else {
      planned.push({ id: entry.id, categoryId: null, ruleId: null, item: { status: 'pending', reason: outcome.reason, confidence: outcome.confidence } });
    }
  }

  return {
    entries: planned,
    counterparts: [...counterparts].map(([transactionId, confidence]) => ({ transactionId, confidence })),
  };
}
