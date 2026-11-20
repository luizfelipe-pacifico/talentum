'use client';

/* Confiança da leitura de uma linha de PDF (ADR 0006).

   Linha lida com certeza ganha um selo discreto; linha com campo deduzido diz
   qual campo conferir. A porcentagem fica no título: o que a pessoa precisa
   saber é o que olhar no documento, não o número. */

export type FieldConfidence = { date: number; amount: number; description: number; overall: number };

const FIELD_NAMES = { date: 'data', amount: 'valor', description: 'descrição' } as const;

export function ConfidenceChip({ confidence }: { confidence: FieldConfidence }) {
  if (confidence.overall >= 1) return <span className="chip chip-ok">Lida com certeza</span>;
  const deduced = (Object.keys(FIELD_NAMES) as (keyof typeof FIELD_NAMES)[])
    .filter((field) => confidence[field] < 1)
    .map((field) => FIELD_NAMES[field]);
  return (
    <span className="chip chip-warn" title={`Confiança da leitura: ${Math.round(confidence.overall * 100)}%`}>
      Conferir {deduced.join(' e ')}
    </span>
  );
}
