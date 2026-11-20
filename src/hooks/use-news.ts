'use client';

import { useCallback, useEffect, useState } from 'react';
import { useBackendQuery, type QueryState } from '@/hooks/use-backend-query';
import { ApiError, getJson, postJson } from '@/lib/api-client';
import type { NewsItemResult, NewsListResult, NewsSummary, NewsSummaryResult } from '@/server/cloud-news';

/* Notícias públicas pelo backend local. Nenhuma chamada daqui carrega dado
   financeiro: a lista e a notícia são leituras sem corpo, e o resumo envia um
   corpo vazio. */

export type { NewsItem, NewsSummary } from '@/server/cloud-news';

export function useNewsList(): QueryState<NewsListResult> {
  return useBackendQuery<NewsListResult>('/api/news');
}

/** `not_found` chega como 404 da API local e vira estado próprio, separado da falha de rede. */
export type NewsItemState = { status: 'loading' } | { status: 'error'; retry: () => void } | { status: 'ready'; payload: NewsItemResult };

export function useNewsItem(newsId: string): NewsItemState {
  const [state, setState] = useState<NewsItemState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger; changing it refetches
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    getJson<NewsItemResult>(`/api/news/${encodeURIComponent(newsId)}`, controller.signal)
      .then((payload) => {
        if (active) setState({ status: 'ready', payload });
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) setState({ status: 'ready', payload: { status: 'not_found' } });
        else setState({ status: 'error', retry });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [newsId, attempt, retry]);

  return state;
}

export type SummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; summary: NewsSummary }
  | { status: 'unavailable' }
  | { status: 'error' };

export function useNewsSummary(newsId: string) {
  const [state, setState] = useState<SummaryState>({ status: 'idle' });

  const request = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await postJson<NewsSummaryResult>(`/api/news/${encodeURIComponent(newsId)}/summary`, {});
      if (result.status === 'ok') setState({ status: 'ready', summary: result.summary });
      else setState({ status: 'unavailable' });
    } catch (error) {
      setState({ status: error instanceof ApiError && error.status === 404 ? 'unavailable' : 'error' });
    }
  }, [newsId]);

  return { state, request };
}
