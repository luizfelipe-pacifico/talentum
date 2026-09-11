'use client';

import { useEffect, useState } from 'react';
import { getWithActionCode } from '@/lib/api-client';

export type CategorySlice = { name: string; cents: string };
export type CategoryPayload =
  | { hasProfile: false }
  | { hasProfile: true; period: { start: string; end: string }; totalCents: string; slices: CategorySlice[] };

export type CategoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; payload: CategoryPayload };

export function useCategoryBreakdown(): CategoryState {
  const [state, setState] = useState<CategoryState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getWithActionCode<CategoryPayload>('/api/dashboard/categories', controller.signal)
      .then((payload) => { if (active) setState({ status: 'ready', payload }); })
      .catch(() => { if (active) setState({ status: 'error' }); });

    return () => { active = false; controller.abort(); };
  }, []);

  return state;
}
