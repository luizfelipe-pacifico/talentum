/* Leitura do patrimônio (Stage 14): bens ativos com o último valor de cada um. */

import { db } from '@/server/db';
import { netWorthSummary, type AssetPillar } from '@/server/arca-metrics';

export const ASSET_PILLARS = ['stocks', 'real_estate', 'cash', 'international', 'outside'] as const;

export async function loadAssets(profileId: string) {
  const assets = await db.asset.findMany({
    where: { profileId, isActive: true },
    orderBy: [{ pillar: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      pillar: true,
      snapshots: { orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }], take: 1, select: { valueCents: true, capturedAt: true } },
      _count: { select: { snapshots: true } },
    },
  });
  return assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    pillar: asset.pillar as AssetPillar,
    valueCents: asset.snapshots[0]?.valueCents ?? null,
    capturedAt: asset.snapshots[0]?.capturedAt ?? null,
    snapshotCount: asset._count.snapshots,
  }));
}

export async function loadNetWorth(profileId: string) {
  const assets = await loadAssets(profileId);
  return { assets, summary: netWorthSummary(assets) };
}
