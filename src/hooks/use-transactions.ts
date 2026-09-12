'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson } from '@/lib/api-client';

/* Lançamentos persistidos.

   Como no painel, o estado é discriminado: não existe lista padrão para
   exibir. Uma tabela vazia durante o carregamento ou após falha afirmaria que a
   pessoa não tem lançamentos (docs/DASHBOARD.md, R-29). */

export type TransactionRow = {
  id: string;
  occurredOn: string;
  description: string;
  amountCents: string;
  status: string;
  account: { id: string; name: string } | null;
  category: { id: string; name: string; kind: string } | null;
  importBatchId: string | null;
};

export type TransactionsPayload =
  | { hasProfile: false }
  | { hasProfile: true; total: number; transactions: TransactionRow[]; nextCursor: string | null };

export type TransactionsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; payload: TransactionsPayload };

export function useTransactions(accountId?: string): TransactionsState {
  const [state, setState] = useState<TransactionsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const query = new URLSearchParams({ limit: '100' });
    if (accountId) query.set('accountId', accountId);

    getJson<TransactionsPayload>(`/api/transactions?${query.toString()}`, controller.signal)
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
  }, [accountId, attempt, retry]);

  return state;
}
