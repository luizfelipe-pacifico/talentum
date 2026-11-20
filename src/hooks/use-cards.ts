'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson } from '@/lib/api-client';

/* Cartões, faturas e benefícios do perfil local (Stage 8).

   Estado discriminado, como nas outras telas: enquanto o backend não responde,
   nada é afirmado (docs/PRODUCT.md, R-29). Centavos chegam como string e só
   viram texto na renderização. */

export type StatementSummary = {
  id: string;
  periodStart: string | null;
  closingDate: string;
  dueDate: string;
  totalCents: string;
  paidCents: string;
  outstandingCents: string;
  isEstimated: boolean;
  status: 'open' | 'paid' | 'cancelled';
  itemCount: number;
  itemsTotalCents: string;
};

export type CardBase = {
  id: string;
  name: string;
  lastFourDigits: string | null;
  institution: { id: string; name: string } | null;
  paymentAccount: { id: string; name: string } | null;
  closingDay: number | null;
  dueDay: number;
  limitCents: string | null;
  annualFeeCents: string | null;
  feeWaiver: { thresholdCents: string; period: 'statement' | 'year' } | null;
  isActive: boolean;
  nextCycle: { periodStart: string; closingDate: string; dueDate: string; closingIsEstimated: boolean };
};

export type CardListRow = CardBase & { statementCount: number; openStatement: StatementSummary | null };

export type BenefitRow = {
  id: string;
  kind: 'cashback' | 'points' | 'miles';
  programName: string;
  balance: string;
  expiringBalance: string | null;
  expiresOn: string | null;
  daysUntilExpiry: number | null;
};

export type FeeWaiverProgress = {
  period: 'statement' | 'year';
  thresholdCents: string;
  spentCents: string;
  remainingCents: string;
  percent: number;
  met: boolean;
  basisDueDate: string | null;
};

/** No detalhe, `feeWaiver` traz o termômetro calculado pelo backend. */
export type CardDetailPayload = Omit<CardBase, 'feeWaiver'> & {
  statements: StatementSummary[];
  benefits: BenefitRow[];
  feeWaiver: FeeWaiverProgress | null;
};

export type PaymentCandidate = {
  transactionId: string;
  occurredOn: string;
  amountCents: string;
  description: string;
  accountName: string;
  match: 'exact' | 'partial';
  daysFromDue: number;
};

export type StatementDetail = {
  id: string;
  card: { id: string; name: string };
  periodStart: string | null;
  closingDate: string;
  dueDate: string;
  totalCents: string;
  paidCents: string;
  outstandingCents: string;
  isEstimated: boolean;
  status: 'open' | 'paid' | 'cancelled';
  itemCount: number;
  itemsTotalCents: string;
  items: {
    id: string;
    occurredOn: string;
    description: string;
    amountCents: string;
    installmentNumber: number | null;
    installmentCount: number | null;
    source: 'manual' | 'import';
  }[];
  payments: {
    id: string;
    amountCents: string;
    createdAt: string;
    transaction: { id: string; occurredOn: string; description: string; accountName: string };
  }[];
  candidates: PaymentCandidate[];
};

export type StatementChecks = {
  hasProfile: true;
  open: {
    id: string;
    card: { id: string; name: string };
    paymentAccountName: string | null;
    dueDate: string;
    totalCents: string;
    paidCents: string;
    outstandingCents: string;
    isEstimated: boolean;
    candidates: PaymentCandidate[];
  }[];
  recentlyPaid: {
    id: string;
    card: { id: string; name: string };
    dueDate: string;
    totalCents: string;
    payments: { id: string; amountCents: string; occurredOn: string; description: string; accountName: string }[];
  }[];
};

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'missing' }
  | { status: 'ready'; data: T; reload: () => void };

/**
 * Consulta com recarga: `reload` busca de novo sem voltar ao esqueleto, para que
 * a tela não pisque depois de cada gravação.
 */
function useLoadable<T>(path: string | null, pick: (payload: Record<string, unknown>) => T | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger; pick is stable per call site
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let active = true;

    getJson<Record<string, unknown>>(path, controller.signal)
      .then((payload) => {
        if (!active) return;
        const data = pick(payload);
        setState(data === null ? { status: 'missing' } : { status: 'ready', data, reload });
      })
      .catch((error: { status?: number }) => {
        if (!active) return;
        setState(error?.status === 404 ? { status: 'missing' } : { status: 'error', retry });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [path, attempt, reload, retry]);

  return state;
}

/** `null` em `data` quando ainda não existe perfil local. */
export function useCards() {
  return useLoadable<{ hasProfile: boolean; cards: CardListRow[] }>('/api/cards', (payload) => ({
    hasProfile: payload.hasProfile === true,
    cards: (payload.cards as CardListRow[] | undefined) ?? [],
  }));
}

export function useCardDetail(cardId: string) {
  return useLoadable<CardDetailPayload>(`/api/cards/${encodeURIComponent(cardId)}`, (payload) =>
    (payload.card as CardDetailPayload | undefined) ?? null,
  );
}

export function useStatementDetail(statementId: string | null) {
  return useLoadable<StatementDetail>(
    statementId ? `/api/card-statements/${encodeURIComponent(statementId)}` : null,
    (payload) => (payload.statement as StatementDetail | undefined) ?? null,
  );
}

export function useStatementChecks() {
  return useLoadable<StatementChecks | { hasProfile: false }>('/api/card-statement-checks', (payload) =>
    payload.hasProfile === true ? (payload as unknown as StatementChecks) : { hasProfile: false },
  );
}

/** Converte o valor digitado em centavos inteiros, sem passar por ponto flutuante. */
export function toCents(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^\d,.-]/g, '');
  if (cleaned.length === 0) return null;
  const digits = cleaned.replace(/-/g, '');
  const separator = Math.max(digits.lastIndexOf(','), digits.lastIndexOf('.'));
  // Separador seguido de exatamente três dígitos é de milhar, não decimal.
  const isDecimal = separator !== -1 && digits.length - separator - 1 <= 2;
  const units = (isDecimal ? digits.slice(0, separator) : digits).replace(/[.,]/g, '') || '0';
  const fraction = isDecimal ? digits.slice(separator + 1) : '';
  const cents = `${units}${fraction.padEnd(2, '0')}`;
  if (!/^\d{1,15}$/.test(cents)) return null;
  return BigInt(cents).toString();
}

/** Inteiro positivo digitado (pontos e milhas), aceitando separador de milhar. */
export function toUnits(raw: string): string | null {
  const cleaned = raw.trim().replace(/[.\s]/g, '');
  if (!/^\d{1,15}$/.test(cleaned)) return null;
  return BigInt(cleaned).toString();
}

export const BENEFIT_KIND_LABELS: Record<BenefitRow['kind'], string> = {
  cashback: 'Cashback',
  points: 'Pontos',
  miles: 'Milhas',
};

export const STATUS_LABELS: Record<StatementSummary['status'], string> = {
  open: 'Em aberto',
  paid: 'Paga',
  cancelled: 'Cancelada',
};
