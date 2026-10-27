'use client';

import { useCallback, useEffect, useState } from 'react';
import { getWithActionCode } from '@/lib/api-client';

/* Consulta GET a um contrato do backend local, com os três estados que toda
   tela precisa desenhar (docs/DASHBOARD.md, R-28). Não existe valor padrão:
   enquanto não há resposta, a tela não afirma nada. */

export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; payload: T };

export function useBackendQuery<T>(path: string): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    getWithActionCode<T>(path, controller.signal)
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
  }, [path, attempt, retry]);

  return state;
}
