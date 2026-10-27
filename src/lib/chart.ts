/* Medidas de gráfico, puras para terem teste.

   A barra de categoria antes media a fatia do maior grupo: com "Participação"
   no cabeçalho, uma categoria de 50% aparecia com a barra cheia. */

/** Participação no total, em porcentagem com uma casa e arredondamento half-up. */
export function shareOfTotal(cents: bigint, totalCents: bigint): number {
  if (totalCents <= 0n || cents <= 0n) return 0;
  return Number((cents * 2000n + totalCents) / (totalCents * 2n)) / 10;
}
