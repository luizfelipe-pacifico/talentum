/* Patrimônio e os quatro pilares (Stage 14 de docs/ROADMAP.md).

   A divisão em quatro pilares iguais e a banda de 22,5% a 27,5% vêm da
   metodologia ARCA, criada por Thiago Nigro (docs/ARCA-VISION.md, seção 5).
   O Talentum calcula a proporção e simula onde um aporte **novo** reduziria o
   desequilíbrio; nunca sugere venda e não recomenda produto.

   Módulo puro: sem Prisma, sem rede, sem relógio implícito. Centavos em BigInt
   e participação em pontos-base (10.000 = 100%). */

export const PILLARS = ['stocks', 'real_estate', 'cash', 'international'] as const;
export type Pillar = (typeof PILLARS)[number];
export type AssetPillar = Pillar | 'outside';

/** Banda de equilíbrio por pilar, em pontos-base. Os limites contam como dentro. */
export const BAND_MIN_BPS = 2_250;
export const BAND_MAX_BPS = 2_750;
export const TARGET_BPS = 2_500;

export type PillarStatus = 'balanced' | 'lagging' | 'overweight';

export type AssetValueInput = {
  pillar: AssetPillar;
  /** Último valor informado, ou `null` quando o bem ainda não tem valor. */
  valueCents: bigint | null;
  capturedAt: Date | null;
};

/** Participação em pontos-base, com arredondamento half-up. */
export function shareBps(cents: bigint, totalCents: bigint): number {
  if (totalCents <= 0n || cents <= 0n) return 0;
  return Number((cents * 20_000n + totalCents) / (totalCents * 2n));
}

export function pillarStatus(share: number): PillarStatus {
  if (share < BAND_MIN_BPS) return 'lagging';
  if (share > BAND_MAX_BPS) return 'overweight';
  return 'balanced';
}

export type PillarSummary = { pillar: Pillar; cents: bigint; shareBps: number; status: PillarStatus };

export type NetWorthSummary = {
  /** Soma de todos os bens com valor, dentro e fora dos pilares. */
  netWorthCents: bigint;
  /** Soma só dos quatro pilares: a base da proporção. */
  pillarTotalCents: bigint;
  outsideCents: bigint;
  pillars: PillarSummary[];
  /** Data do valor mais antigo usado na soma (R-26), ou `null` sem nenhum. */
  referenceDate: Date | null;
  assetsWithoutValue: number;
  balanced: boolean;
};

export function netWorthSummary(assets: AssetValueInput[]): NetWorthSummary {
  const sums = new Map<AssetPillar, bigint>();
  let referenceDate: Date | null = null;
  let assetsWithoutValue = 0;

  for (const asset of assets) {
    if (asset.valueCents === null) {
      assetsWithoutValue += 1;
      continue;
    }
    sums.set(asset.pillar, (sums.get(asset.pillar) ?? 0n) + asset.valueCents);
    if (asset.capturedAt && (!referenceDate || asset.capturedAt < referenceDate)) referenceDate = asset.capturedAt;
  }

  const pillarTotal = PILLARS.reduce((sum, pillar) => sum + (sums.get(pillar) ?? 0n), 0n);
  const outside = sums.get('outside') ?? 0n;
  const pillars = PILLARS.map((pillar) => {
    const cents = sums.get(pillar) ?? 0n;
    const share = shareBps(cents, pillarTotal);
    return { pillar, cents, shareBps: share, status: pillarStatus(share) };
  });

  return {
    netWorthCents: pillarTotal + outside,
    pillarTotalCents: pillarTotal,
    outsideCents: outside,
    pillars,
    referenceDate,
    assetsWithoutValue,
    balanced: pillarTotal > 0n && pillars.every((item) => item.status === 'balanced'),
  };
}

export type ContributionStep = {
  pillar: Pillar;
  beforeCents: bigint;
  beforeShareBps: number;
  beforeStatus: PillarStatus;
  allocationCents: bigint;
  afterCents: bigint;
  afterShareBps: number;
  afterStatus: PillarStatus;
};

/**
 * Simula um aporte novo distribuído entre os pilares, sem vender nada.
 *
 * Nivelamento por baixo ("enchimento de água"): o dinheiro vai primeiro ao
 * pilar mais defasado até alcançar o próximo mais baixo, depois aos dois
 * juntos, e assim por diante, nunca acima de 25% do total depois do aporte.
 * Como a soma das faltas até 25% é sempre maior ou igual ao aporte, um pilar
 * acima da meta nunca recebe nada — o que congela o pilar sobrecarregado,
 * como na metodologia.
 *
 * Os centavos do arredondamento vão para os pilares mais baixos, na ordem
 * fixa A, R, C, A, para que o resultado seja determinístico e a soma exata.
 */
export function simulateContribution(pillars: { pillar: Pillar; cents: bigint }[], amountCents: bigint): ContributionStep[] {
  if (amountCents < 0n) throw new RangeError('O aporte não pode ser negativo.');
  const before = PILLARS.map((pillar) => ({ pillar, cents: pillars.find((item) => item.pillar === pillar)?.cents ?? 0n }));
  const totalBefore = before.reduce((sum, item) => sum + item.cents, 0n);
  const totalAfter = totalBefore + amountCents;

  // Nível final L: a soma de max(0, L - v) sobre os pilares é igual ao aporte.
  const sorted = [...before].sort((left, right) => (left.cents < right.cents ? -1 : left.cents > right.cents ? 1 : 0));
  let level = 0n;
  let remainder = 0n;
  let receivers = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const count = BigInt(index + 1);
    const base = sorted.slice(0, index + 1).reduce((sum, item) => sum + item.cents, 0n);
    const next = index + 1 < sorted.length ? sorted[index + 1].cents : null;
    // Quanto custa levar os `count` mais baixos até o próximo valor.
    const costToNext = next === null ? null : next * count - base;
    if (costToNext === null || costToNext >= amountCents) {
      const pool = amountCents + base;
      level = pool / count;
      remainder = pool % count;
      receivers = index + 1;
      break;
    }
  }
  if (amountCents === 0n) receivers = 0;

  const allocation = new Map<Pillar, bigint>(PILLARS.map((pillar) => [pillar, 0n]));
  const receiving = sorted.slice(0, receivers);
  for (const item of receiving) allocation.set(item.pillar, level - item.cents);
  // Restos de centavo: um a um, na ordem fixa dos pilares.
  const order = PILLARS.filter((pillar) => receiving.some((item) => item.pillar === pillar));
  for (let index = 0; index < Number(remainder); index += 1) {
    const pillar = order[index % order.length];
    allocation.set(pillar, (allocation.get(pillar) as bigint) + 1n);
  }

  return before.map((item) => {
    const allocationCents = allocation.get(item.pillar) as bigint;
    const afterCents = item.cents + allocationCents;
    const beforeShare = shareBps(item.cents, totalBefore);
    const afterShare = shareBps(afterCents, totalAfter);
    return {
      pillar: item.pillar,
      beforeCents: item.cents,
      beforeShareBps: beforeShare,
      beforeStatus: pillarStatus(beforeShare),
      allocationCents,
      afterCents,
      afterShareBps: afterShare,
      afterStatus: pillarStatus(afterShare),
    };
  });
}
