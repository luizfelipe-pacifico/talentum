'use client';

import { useCallback, useEffect, useState } from 'react';
import { getWithActionCode } from '@/lib/api-client';

export type DashboardMetrics = {
  period: { start: string; end: string; elapsedDays: number };
  /* Centavos chegam como string e são formatados na renderização. */
  riskFreeBalanceCents: string;
  balanceCents: string;
  committedCents: string;
  committedCount: number;
  /** Obrigações do período cadastradas com valor aproximado (L-1). */
  committedEstimatedCount: number;
  /** Data do saldo informado mais antigo usado no consolidado (R-26). */
  balanceReferenceDate: string | null;
  monthExpensesCents: string;
  monthExpensesChange: number | null;
  dailyAverageCents: string;
  dailyAverageChange: number | null;
  accountsWithKnownBalance: number;
  accountsWithUnknownBalance: number;
  /** Contas ativas em outra moeda, fora do saldo consolidado (L-4). */
  accountsInOtherCurrency: number;
  pendingCount: number;
  importCount: number;
  /** Alertas locais de vencimento e de dados desatualizados (src/server/alerts.ts). */
  alerts: DashboardAlert[];
};

export type AlertObligation = { id: string; description: string; amountCents: string; dueDate: string; isEstimated: boolean };

export type DashboardAlert =
  | { kind: 'obligation_overdue'; severity: 'danger'; count: number; obligations: AlertObligation[] }
  | { kind: 'obligation_due_soon'; severity: 'warning'; count: number; obligations: AlertObligation[] }
  | { kind: 'stale_data'; severity: 'info'; count: number; accounts: { id: string; name: string; lastDataAt: string }[] };

export type DashboardPayload = { hasProfile: false } | ({ hasProfile: true } & DashboardMetrics);

/* Estado discriminado de propósito: não existe valor padrão para exibir.
   Um zero renderizado durante carregamento ou falha é uma afirmação falsa sobre
   o dinheiro da pessoa usuária (docs/PRODUCT.md, D-2 e R-29). */
export type DashboardState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; payload: DashboardPayload };

export function useDashboardData(): DashboardState {
  const [state, setState] = useState<DashboardState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger; changing it refetches
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getWithActionCode<DashboardPayload>('/api/dashboard', controller.signal)
      .then((payload) => {
        if (active) setState({ status: 'ready', payload });
      })
      .catch(() => {
        if (active) setState({ status: 'error', retry });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, retry]);

  return state;
}
