'use client';

import { useBackendQuery, type QueryState } from '@/hooks/use-backend-query';

export type CategorySlice = { name: string; cents: string };
export type CategoryPayload =
  | { hasProfile: false }
  | { hasProfile: true; period: { start: string; end: string }; totalCents: string; slices: CategorySlice[] };

/* O estado de erro traz `retry`: o gráfico mostra a falha e oferece repetir. */
export type CategoryState = QueryState<CategoryPayload>;

export function useCategoryBreakdown(): CategoryState {
  return useBackendQuery<CategoryPayload>('/api/dashboard/categories');
}
