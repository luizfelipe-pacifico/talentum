'use client';

/* Uma notícia pública e o resumo sob demanda (Etapas 15 e 16).

   O resumo é pedido pela pessoa, nunca automaticamente, e diz como foi feito:
   por modelo de linguagem ou, quando ele não está disponível, pelo trecho
   inicial da notícia. Só o texto público da notícia entra no resumo; nenhum
   dado deste computador sai junto. */

import Link from 'next/link';
import { StateArt } from '@/components/state-art';
import { useNewsItem, useNewsSummary } from '@/hooks/use-news';
import { formatPublished } from './news-format';
import { NewsUnavailable } from './news-page';

const SUMMARY_LABEL = {
  AI: 'Resumo gerado automaticamente a partir do texto público da notícia. Confira na fonte.',
  EXTRACT: 'Trecho inicial da notícia (resumo automático indisponível).',
} as const;

function BackLink() {
  return (
    <Link className="btn-link standalone-action" href="/invest">
      <i className="bi bi-arrow-left-short" aria-hidden="true" />
      Voltar às notícias
    </Link>
  );
}

function Summary({ newsId }: { newsId: string }) {
  const { state, request } = useNewsSummary(newsId);

  if (state.status === 'ready') {
    return (
      <section className="callout callout-info news-summary" aria-live="polite">
        <i className="bi bi-card-text" aria-hidden="true" />
        <div>
          <h3 className="news-summary-title">Resumo</h3>
          <p className="news-summary-text">{state.summary.text}</p>
          <p className="small muted">{SUMMARY_LABEL[state.summary.method]}</p>
        </div>
      </section>
    );
  }

  return (
    <div className="stack news-summary-action" aria-live="polite">
      <button type="button" className="btn btn-primary standalone-action" disabled={state.status === 'loading'} onClick={request}>
        <i className="bi bi-card-text" aria-hidden="true" />
        {state.status === 'loading' ? 'Resumindo notícia…' : state.status === 'idle' ? 'Resumir notícia' : 'Tentar resumir de novo'}
      </button>
      {(state.status === 'error' || state.status === 'unavailable') && (
        <p className="small muted" role="status">
          Não foi possível resumir esta notícia agora. O texto completo continua disponível na fonte.
        </p>
      )}
    </div>
  );
}

export function NewsArticle({ newsId }: { newsId: string }) {
  const state = useNewsItem(newsId);

  if (state.status === 'loading') {
    return (
      <section className="card card-lg" aria-busy="true" aria-label="Buscando a notícia">
        <span className="skeleton skeleton-eyebrow" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
      </section>
    );
  }
  if (state.status === 'error') return <NewsUnavailable kind="offline" retry={state.retry} />;

  const result = state.payload;
  if (result.status === 'unconfigured' || result.status === 'offline') return <NewsUnavailable kind={result.status} />;
  if (result.status === 'not_found') {
    return (
      <section className="card card-lg empty">
        <StateArt name="sem-noticias" />
        <h2 className="h-display">Notícia não encontrada</h2>
        <p className="muted">Esta notícia saiu da lista ou o endereço está incompleto. As notícias ficam disponíveis por 30 dias.</p>
        <Link className="btn btn-neutral" href="/invest">
          Ver notícias recentes
        </Link>
      </section>
    );
  }

  const { item } = result;
  return (
    <div className="stack">
      <BackLink />
      <article className="card card-lg news-article">
        <h2 className="h-display-lg news-title">{item.title}</h2>
        <p className="small muted news-byline">
          {item.source.name} · <time dateTime={item.publishedAt}>{formatPublished(item.publishedAt)}</time>
        </p>
        {item.excerpt && <p className="news-excerpt">{item.excerpt}</p>}
        <Summary newsId={item.id} />
        <div className="row news-source">
          <a className="btn btn-neutral" href={item.url} target="_blank" rel="noopener noreferrer">
            Ler na fonte
            <i className="bi bi-box-arrow-up-right" aria-hidden="true" />
          </a>
          <p className="small muted">
            Fonte: {item.source.name}. {item.source.license}
          </p>
        </div>
      </article>
    </div>
  );
}
