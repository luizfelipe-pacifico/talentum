'use client';

import { useBackendQuery, type QueryState } from '@/hooks/use-backend-query';

export type LocalSummary =
  | { hasProfile: false }
  | {
      hasProfile: true;
      accounts: number;
      transactions: number;
      pendingTransactions: number;
      openObligations: number;
      imports: number;
    };

/** Contagens por área: a fonte que autoriza uma tela a dizer "nenhum". */
export function useLocalSummary(): QueryState<LocalSummary> {
  return useBackendQuery<LocalSummary>('/api/local-summary');
}
