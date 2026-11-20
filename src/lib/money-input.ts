/* Leitura de valores digitados pela pessoa, sem ponto flutuante.

   `Number('1234.56') * 100` erra centavos em alguns valores; aqui o texto é
   convertido em centavos inteiros direto, aceitando o formato brasileiro
   (`1.234,56`) e o ponto decimal quando não há vírgula (`1234.56`). Sem
   imports: roda no navegador e direto nos testes. */

/** Centavos como string inteira, ou `null` quando o texto não é um valor. */
export function parseMoneyInput(text: string, options: { allowZero?: boolean } = {}): string | null {
  let value = text.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (value === '' || value.startsWith('-')) return null;

  if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    // "1.234" com grupos de milhar e sem decimais.
    value = value.replace(/\./g, '');
  }

  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  if (cents === 0n && !options.allowZero) return null;
  return cents.toString();
}

/** Taxa em porcentagem ("12,5") para pontos-base inteiros (1250). */
export function parsePercentToBps(text: string): number | null {
  const value = text.trim().replace('%', '').replace(',', '.');
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
}

/** Centavos inteiros em texto editável no formato brasileiro ("1234,56"). */
export function centsToInput(cents: string): string {
  const amount = BigInt(cents);
  const negative = amount < 0n;
  const magnitude = negative ? -amount : amount;
  return `${negative ? '-' : ''}${magnitude / 100n},${(magnitude % 100n).toString().padStart(2, '0')}`;
}

/** Pontos-base em porcentagem legível ("12,5%"). */
export function formatBps(bps: number, decimals = 1): string {
  return `${(bps / 100).toFixed(decimals).replace('.', ',')}%`;
}
