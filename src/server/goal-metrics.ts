/* Fórmulas de metas de economia (Stage 12 de docs/ROADMAP.md).

   Módulo puro: sem Prisma, sem rede, sem relógio implícito. Centavos em BigInt.

   A viabilidade compara o depósito mensal necessário com a sobra mensal
   **medida** nos extratos, nunca com uma sobra suposta. A sugestão de
   distribuição da sobra é aritmética (proporcional ou ponderada pelo prazo):
   não indica produto, instituição nem investimento. */

export type ContributionInput = { kind: 'deposit' | 'withdrawal'; amountCents: bigint };

/** Valor guardado: depósitos menos retiradas. Nunca negativo por construção da API. */
export function savedCents(contributions: ContributionInput[]): bigint {
  let total = 0n;
  for (const contribution of contributions) {
    total += contribution.kind === 'withdrawal' ? -contribution.amountCents : contribution.amountCents;
  }
  return total;
}

/** Progresso em pontos-base (10.000 = 100%), limitado a 100% e a zero. */
export function progressBps(saved: bigint, target: bigint): number {
  if (target <= 0n || saved <= 0n) return 0;
  if (saved >= target) return 10_000;
  return Number((saved * 10_000n) / target);
}

/**
 * Meses de depósito até o prazo, contando o mês corrente.
 *
 * Uma meta para o fim deste mês ainda tem um mês de depósito; um prazo que
 * já passou tem zero. Sem prazo, `null`.
 */
export function monthsUntil(today: Date, deadline: Date | null): number | null {
  if (!deadline) return null;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (deadline < startOfToday) return 0;
  return (deadline.getFullYear() - today.getFullYear()) * 12 + (deadline.getMonth() - today.getMonth()) + 1;
}

/** Divisão inteira arredondada para cima: centavo faltando é meta não batida. */
function divideCeil(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

export type GoalFeasibility =
  | 'achieved'
  | 'no_deadline'
  | 'deadline_passed'
  | 'no_data'
  | 'feasible'
  | 'not_feasible';

export type GoalPlan = {
  savedCents: bigint;
  remainingCents: bigint;
  progressBps: number;
  monthsLeft: number | null;
  /** Depósito mensal que fecha a meta no prazo; `null` sem prazo ou com prazo vencido. */
  requiredMonthlyCents: bigint | null;
  feasibility: GoalFeasibility;
};

/**
 * Plano de uma meta: quanto falta, quanto depositar por mês e se cabe na sobra.
 *
 * `measuredSurplusCents` é a sobra mensal média medida; `null` quando não há
 * mês completo com extrato. Sobra zero ou negativa torna inviável qualquer
 * depósito positivo.
 */
export function goalPlan(input: {
  targetCents: bigint;
  deadline: Date | null;
  contributions: ContributionInput[];
  today: Date;
  measuredSurplusCents: bigint | null;
}): GoalPlan {
  const saved = savedCents(input.contributions);
  const remaining = input.targetCents > saved ? input.targetCents - saved : 0n;
  const monthsLeft = monthsUntil(input.today, input.deadline);
  const base = { savedCents: saved, remainingCents: remaining, progressBps: progressBps(saved, input.targetCents), monthsLeft };

  if (remaining === 0n) return { ...base, requiredMonthlyCents: 0n, feasibility: 'achieved' };
  if (monthsLeft === null) return { ...base, requiredMonthlyCents: null, feasibility: 'no_deadline' };
  if (monthsLeft === 0) return { ...base, requiredMonthlyCents: null, feasibility: 'deadline_passed' };

  const required = divideCeil(remaining, BigInt(monthsLeft));
  if (input.measuredSurplusCents === null) return { ...base, requiredMonthlyCents: required, feasibility: 'no_data' };
  return {
    ...base,
    requiredMonthlyCents: required,
    feasibility: required <= input.measuredSurplusCents ? 'feasible' : 'not_feasible',
  };
}

export type AllocationGoal = { id: string; remainingCents: bigint; requiredMonthlyCents: bigint | null };

export type Allocation = { goalId: string; cents: bigint };

/**
 * Distribui `amountCents` por pesos inteiros, sem ultrapassar o que falta em
 * cada meta, pelo método do maior resto: a soma das partes é exatamente o
 * valor distribuído (ou o total que falta, se for menor).
 */
function allocateByWeights(amountCents: bigint, entries: { id: string; weight: bigint; cap: bigint }[]): Allocation[] {
  const given = new Map(entries.map((entry) => [entry.id, 0n]));
  const room = (entry: { id: string; cap: bigint }) => entry.cap - (given.get(entry.id) as bigint);
  let left = amountCents;

  // Cada rodada: quem receberia mais do que falta fica com o que falta, e o
  // excedente é redistribuído entre os demais na rodada seguinte.
  for (let round = 0; round <= entries.length && left > 0n; round += 1) {
    const active = entries.filter((entry) => entry.weight > 0n && room(entry) > 0n);
    if (active.length === 0) break;
    const totalWeight = active.reduce((sum, entry) => sum + entry.weight, 0n);

    const capped = active.filter((entry) => left * entry.weight > room(entry) * totalWeight);
    if (capped.length > 0) {
      for (const entry of capped) {
        left -= room(entry);
        given.set(entry.id, entry.cap);
      }
      continue;
    }

    const shares = active.map((entry, order) => ({
      entry,
      order,
      floor: (left * entry.weight) / totalWeight,
      remainder: (left * entry.weight) % totalWeight,
    }));
    let cents = left;
    for (const share of shares) {
      given.set(share.entry.id, (given.get(share.entry.id) as bigint) + share.floor);
      cents -= share.floor;
    }
    // Os centavos do arredondamento vão para os maiores restos, em ordem estável.
    shares.sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : a.order - b.order));
    for (const share of shares) {
      if (cents <= 0n) break;
      given.set(share.entry.id, (given.get(share.entry.id) as bigint) + 1n);
      cents -= 1n;
    }
    left = 0n;
  }

  return entries.map((entry) => ({ goalId: entry.id, cents: given.get(entry.id) as bigint }));
}

/**
 * Sugestão aritmética de distribuição de uma sobra entre metas.
 *
 * - `proportional`: proporcional ao que falta em cada meta.
 * - `deadline`: proporcional ao depósito mensal necessário, o que pesa mais a
 *   meta de prazo mais curto; metas sem prazo ou com prazo vencido recebem só
 *   o que sobrar depois, proporcional ao que falta.
 *
 * Nenhuma meta recebe mais do que falta para ela; o que não couber volta como
 * `unallocatedCents`.
 */
export function allocateSurplus(
  amountCents: bigint,
  goals: AllocationGoal[],
  mode: 'proportional' | 'deadline',
): { allocations: Allocation[]; unallocatedCents: bigint } {
  if (amountCents <= 0n) return { allocations: goals.map((goal) => ({ goalId: goal.id, cents: 0n })), unallocatedCents: 0n };

  let allocations: Allocation[];
  if (mode === 'proportional') {
    allocations = allocateByWeights(
      amountCents,
      goals.map((goal) => ({ id: goal.id, weight: goal.remainingCents, cap: goal.remainingCents })),
    );
  } else {
    const first = allocateByWeights(
      amountCents,
      goals.map((goal) => ({ id: goal.id, weight: goal.requiredMonthlyCents ?? 0n, cap: goal.remainingCents })),
    );
    const given = first.reduce((sum, item) => sum + item.cents, 0n);
    const rest = amountCents - given;
    const byId = new Map(first.map((item) => [item.goalId, item.cents]));
    if (rest > 0n) {
      const second = allocateByWeights(
        rest,
        goals.map((goal) => {
          const room = goal.remainingCents - (byId.get(goal.id) ?? 0n);
          return { id: goal.id, weight: room, cap: room };
        }),
      );
      for (const item of second) byId.set(item.goalId, (byId.get(item.goalId) ?? 0n) + item.cents);
    }
    allocations = goals.map((goal) => ({ goalId: goal.id, cents: byId.get(goal.id) ?? 0n }));
  }

  const total = allocations.reduce((sum, item) => sum + item.cents, 0n);
  return { allocations, unallocatedCents: amountCents - total };
}

