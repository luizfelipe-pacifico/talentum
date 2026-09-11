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
  monthExpensesCents: string;
  monthExpensesChange: number | null;
  dailyAverageCents: string;
  dailyAverageChange: number | null;
  accountsWithKnownBalance: number;
  accountsWithUnknownBalance: number;
  pendingCount: number;
  importCount: number;
};

export type DashboardPayload = { hasProfile: false } | ({ hasProfile: true } & DashboardMetrics);

/* Estado discriminado de propósito: não existe valor padrão para exibir.
   Um zero renderizado durante carregamento ou falha é uma afirmação falsa sobre
   o dinheiro da pessoa usuária (docs/DASHBOARD.md, D-2 e R-29). */
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
