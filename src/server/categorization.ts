/* Categorização automática por regra de estabelecimento.

   Feature 6 de docs/PRODUCT.md: o backend cria o item de conciliação com motivo
   e confiança. Este módulo decide, de forma determinística, o que uma descrição
   de lançamento significa diante das regras ativas da pessoa. Puro, sem banco:
   o mesmo par (descrição, regras) produz sempre o mesmo resultado, e o teste do
   Node importa o arquivo direto.

   Política, registrada em docs/PRODUCT.md (Feature 6):

   - `exact` e `startsWith` descrevem o estabelecimento sem ambiguidade: a regra
     é aplicada na hora, com uma decisão auditável e reversível, e o lançamento
     não entra na fila;
   - `contains` casa trechos que outros estabelecimentos também podem ter: vira
     **sugestão** na fila, e a pessoa confirma;
   - duas regras de mesma prioridade e mesma especificidade que apontam para
     categorias diferentes são conflito: nada é aplicado e a fila mostra o
     motivo. */

export type MatchType = 'contains' | 'startsWith' | 'exact';

export type MerchantRuleInput = {
  id: string;
  categoryId: string;
  pattern: string;
  matchType: MatchType;
  priority: number;
};

export type Categorization =
  | { kind: 'apply'; categoryId: string; ruleId: string; confidence: number; reason: 'merchant_rule' }
  | { kind: 'suggest'; categoryId: string; ruleId: string; confidence: number; reason: 'merchant_rule_suggestion' }
  | { kind: 'conflict'; confidence: 0; reason: 'merchant_rule_conflict' }
  | { kind: 'none'; confidence: 0; reason: 'category_unknown' };

/** Confiança de cada forma de casamento, de 0 a 100. */
export const MATCH_CONFIDENCE: Record<MatchType, number> = { exact: 100, startsWith: 90, contains: 60 };

/** A partir desta confiança a regra é aplicada sem passar pela fila. */
export const AUTO_APPLY_CONFIDENCE = 90;

const SPECIFICITY: Record<MatchType, number> = { exact: 3, startsWith: 2, contains: 1 };

/**
 * Forma comparável de um texto: sem acento, sem caixa, com espaços colapsados.
 *
 * O extrato traz `SUPERMERCADO  SINTÉTICO` e a regra foi escrita como
 * `supermercado sintetico`: as duas formas precisam casar.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function ruleMatches(description: string, rule: Pick<MerchantRuleInput, 'pattern' | 'matchType'>): boolean {
  const text = normalizeForMatch(description);
  const pattern = normalizeForMatch(rule.pattern);
  if (pattern.length === 0) return false;
  if (rule.matchType === 'exact') return text === pattern;
  if (rule.matchType === 'startsWith') return text.startsWith(pattern);
  return text.includes(pattern);
}

/**
 * Decide a categoria de uma descrição.
 *
 * Ordem: maior prioridade, depois a forma mais específica (`exact` antes de
 * `startsWith` antes de `contains`), depois o padrão mais longo. Empate real
 * entre categorias diferentes no topo é conflito, nunca sorteio.
 */
export function categorize(description: string, rules: readonly MerchantRuleInput[]): Categorization {
  const matches = rules.filter((rule) => ruleMatches(description, rule));
  if (matches.length === 0) return { kind: 'none', confidence: 0, reason: 'category_unknown' };

  const rank = (rule: MerchantRuleInput) => [rule.priority, SPECIFICITY[rule.matchType], normalizeForMatch(rule.pattern).length];
  const compare = (left: MerchantRuleInput, right: MerchantRuleInput) => {
    const [a, b] = [rank(left), rank(right)];
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return b[index] - a[index];
    return 0;
  };
  const sorted = [...matches].sort(compare);
  const best = sorted[0];
  const tied = sorted.filter((rule) => compare(rule, best) === 0);
  if (new Set(tied.map((rule) => rule.categoryId)).size > 1) {
    return { kind: 'conflict', confidence: 0, reason: 'merchant_rule_conflict' };
  }

  const confidence = MATCH_CONFIDENCE[best.matchType];
  return confidence >= AUTO_APPLY_CONFIDENCE
    ? { kind: 'apply', categoryId: best.categoryId, ruleId: best.id, confidence, reason: 'merchant_rule' }
    : { kind: 'suggest', categoryId: best.categoryId, ruleId: best.id, confidence, reason: 'merchant_rule_suggestion' };
}

/**
 * Padrão proposto para uma regra nova a partir de uma descrição.
 *
 * As duas primeiras palavras costumam ser o estabelecimento; o resto do texto
 * do extrato muda a cada compra (data, cidade, número do documento). Números
 * soltos ficam de fora pelo mesmo motivo.
 */
export function proposedPattern(description: string): string {
  const words = normalizeForMatch(description)
    .split(' ')
    .filter((word) => word.length > 0 && !/^\d[\d./-]*$/.test(word));
  return words.slice(0, 2).join(' ').slice(0, 120);
}
