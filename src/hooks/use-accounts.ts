'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson } from '@/lib/api-client';

/* Contas do perfil local.

   Estado discriminado, como no painel: não existe lista padrão para exibir.
   Uma tabela vazia durante o carregamento afirmaria que a pessoa não tem
   contas (docs/DASHBOARD.md, R-29). */

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  institution: { id: string; name: string } | null;
  transactionCount: number;
  /** `null` quando o saldo é desconhecido. Desconhecido não é zero. */
  balanceCents: string | null;
  balanceCapturedAt: string | null;
};

export type AccountsPayload = { hasProfile: false } | { hasProfile: true; accounts: AccountRow[] };

export type AccountsState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; payload: AccountsPayload; reload: () => void };

export function useAccounts(): AccountsState {
  const [state, setState] = useState<AccountsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getJson<AccountsPayload>('/api/accounts', controller.signal)
      .then((payload) => {
        if (active) setState({ status: 'ready', payload, reload });
      })
      .catch(() => {
        if (active) setState({ status: 'error', retry });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, retry, reload]);

  return state;
}

export type PixIdentifierRow = {
  id: string;
  type: string;
  label: string | null;
  maskedValue: string;
  isActive: boolean;
  source: string;
};

export type AccountDetail = {
  id: string;
  name: string;
  type: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
  institution: { id: string; name: string } | null;
  transactionCount: number;
  importBatchCount: number;
  obligationCount: number;
  balanceCents: string | null;
  balanceCapturedAt: string | null;
  balanceHistory: { id: string; balanceCents: string; capturedAt: string; fromImport: boolean }[];
  pixIdentifiers: PixIdentifierRow[];
};

export type AccountDetailState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; account: AccountDetail; reload: () => void };

export function useAccountDetail(accountId: string): AccountDetailState {
  const [state, setState] = useState<AccountDetailState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getJson<{ hasProfile: boolean; account?: AccountDetail }>(
      `/api/accounts/${encodeURIComponent(accountId)}`,
      controller.signal,
    )
      .then((payload) => {
        if (!active) return;
        if (!payload.account) setState({ status: 'missing' });
        else setState({ status: 'ready', account: payload.account, reload });
      })
      .catch((error) => {
        if (!active) return;
        setState({ status: error?.status === 404 ? 'missing' : 'error' });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [accountId, attempt, reload]);

  return state;
}

/** Rótulos dos tipos de conta, espelhando docs/ONBOARDING.md, Bloco 2. */
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Conta corrente',
  payment: 'Conta de pagamento',
  savings: 'Poupança',
  brokerage: 'Corretora',
  wallet: 'Carteira digital',
  cash: 'Dinheiro',
};

/** Rótulos dos tipos de chave PIX. */
export const PIX_TYPE_LABELS: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  phone: 'Telefone',
  email: 'E-mail',
  random: 'Chave aleatória',
};
