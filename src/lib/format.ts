/* Formatação monetária.

   Centavos viajam como string e viram texto só aqui, na borda de apresentação
   (docs/DASHBOARD.md, R-25). O símbolo de moeda é devolvido separado do valor
   para que receba peso menor na interface (R-24). */

const groupFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0, useGrouping: true });

export type Money = { symbol: string; value: string; negative: boolean };

export function formatCents(cents: string): Money {
  const amount = BigInt(cents);
  const negative = amount < 0n;
  const magnitude = negative ? -amount : amount;
  const units = groupFormatter.format(magnitude / 100n);
  const fraction = (magnitude % 100n).toString().padStart(2, '0');
  return { symbol: 'R$', value: `${negative ? '-' : ''}${units},${fraction}`, negative };
}

/** Variação percentual já assinada. `null` quando não há base de comparação. */
export function formatPercent(change: number | null): string | null {
  if (change === null) return null;
  const rounded = Math.round(change * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toString().replace('.', ',')}%`;
}

/** Rótulo curto do período: "1 a 30 de setembro". */
export function formatPeriod(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(end);
  return `${start.getDate()} a ${end.getDate()} de ${month}`;
}
