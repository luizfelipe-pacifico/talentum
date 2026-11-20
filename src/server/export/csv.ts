/* Exportação de lançamentos em CSV.

   A descrição de um lançamento vem do extrato do banco e é gravada como veio.
   Uma descrição como `=HIPERLINK("http://…")` vira fórmula ao abrir o CSV numa
   planilha (injeção de CSV, CWE-1236). A regra de docs/SECURITY.md, item 22:
   toda célula de texto que começa com `=`, `+`, `-`, `@`, tabulação ou retorno
   de carro recebe um apóstrofo na frente, como recomenda a OWASP. As variantes
   de largura total (`＝`, `＋`, `－`, `＠`) também, porque algumas planilhas as
   normalizam.

   Valores monetários são gerados aqui mesmo, a partir de centavos inteiros, e
   têm formato fechado (`-1234,56`): um número negativo é legítimo e não é
   neutralizado.

   Formato: UTF-8 com BOM, separador `;` e vírgula decimal, que é como o Excel
   em português abre um CSV sem perguntar nada. Sem imports de alias. */

const FORMULA_START = /^[\s]*[=+\-@＝＋－＠]|^[\t\r]/u;
const MONEY = /^-?\d+,\d{2}$/;

export function neutralizeCsvText(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Célula entre aspas, com aspas internas duplicadas (RFC 4180). */
export function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function formatCentsForCsv(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const units = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${units},${fraction}`;
}

export type CsvTransaction = {
  id: string;
  occurredOn: Date;
  description: string;
  amountCents: bigint;
  currency: string;
  accountName: string;
  categoryName: string | null;
  status: string;
  importBatchId: string | null;
};

export const CSV_HEADER = ['id', 'data', 'descricao', 'valor', 'moeda', 'conta', 'categoria', 'situacao', 'importacao'] as const;

const STATUS_LABEL: Record<string, string> = { posted: 'confirmado', pending: 'pendente' };

export function transactionsCsv(rows: CsvTransaction[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(';')];
  for (const row of rows) {
    const money = formatCentsForCsv(row.amountCents);
    // Garantia de formato: um valor monetário fora do padrão seria tratado como texto.
    const amount = MONEY.test(money) ? money : neutralizeCsvText(money);
    const cells = [
      row.id,
      row.occurredOn.toISOString().slice(0, 10),
      neutralizeCsvText(row.description),
      amount,
      neutralizeCsvText(row.currency),
      neutralizeCsvText(row.accountName),
      neutralizeCsvText(row.categoryName ?? ''),
      STATUS_LABEL[row.status] ?? neutralizeCsvText(row.status),
      row.importBatchId ?? '',
    ];
    lines.push(cells.map(csvCell).join(';'));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
