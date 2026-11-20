'use client';

/* Notícias econômicas públicas (Etapa 15, docs/PRODUCT.md).

   A lista vem do backend local, que a busca no serviço do Talentum sem enviar
   nenhum dado financeiro. O filtro por fonte roda só nesta tela. Cada estado
   diz o que foi confirmado: "nenhuma notícia" só aparece quando a consulta
   respondeu com a lista vazia. */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { StateArt } from '@/components/state-art';
import { useNewsList, type NewsItem } from '@/hooks/use-news';
import { formatPublished } from './news-format';

export function NewsUnavailable({ kind, retry }: { kind: 'unconfigured' | 'offline'; retry?: () => void }) {
  if (kind === 'unconfigured') {
    return (
      <section className="card card-lg empty">
        <StateArt name="sem-noticias" />
        <h2 className="h-display">Notícias desativadas neste computador</h2>
        <p className="muted">
          As notícias vêm do serviço on-line do Talentum, e o endereço desse serviço não está configurado aqui. Seus dados
          financeiros continuam só neste computador.
        </p>
      </section>
    );
  }
  return (
    <section className="card card-lg empty error-state" role="alert">
      <StateArt name="falha-consulta" />
      <h2 className="h-display">Não foi possível buscar as notícias</h2>
      <p className="muted">O serviço de notícias não respondeu. Verifique a conexão com a internet e tente de novo.</p>
      {retry && (
        <button type="button" className="btn btn-neutral" onClick={retry}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          Buscar notícias de novo
        </button>
      )}
    </section>
  );
}

function NewsSkeleton() {
  return (
    <section className="card card-flush news-list" aria-busy="true" aria-label="Buscando notícias">
      {[0, 1, 2].map((key) => (
        <div key={key} className="news-row">
          <span className="skeleton skeleton-line" />
          <span className="skeleton skeleton-eyebrow" />
          <span className="skeleton skeleton-line" />
        </div>
      ))}
    </section>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <li className="news-row">
      <h2 className="h-display news-title">
        <Link href={`/invest/${encodeURIComponent(item.id)}`}>{item.title}</Link>
      </h2>
      <p className="small muted news-byline">
        {item.source.name} · <time dateTime={item.publishedAt}>{formatPublished(item.publishedAt)}</time>
      </p>
      {item.excerpt && <p className="news-excerpt">{item.excerpt}</p>}
    </li>
  );
}

export function NewsPage() {
  const state = useNewsList();
  const [source, setSource] = useState<string | null>(null);

  const sources = useMemo(() => {
    if (state.status !== 'ready' || state.payload.status !== 'ok') return [];
    const seen = new Map<string, string>();
    for (const item of state.payload.items) seen.set(item.source.key, item.source.name);
    return [...seen.entries()];
  }, [state]);

  if (state.status === 'loading') return <NewsSkeleton />;
  if (state.status === 'error') return <NewsUnavailable kind="offline" retry={state.retry} />;
  if (state.payload.status !== 'ok') return <NewsUnavailable kind={state.payload.status} />;

  const { items } = state.payload;
  if (items.length === 0) {
    return (
      <section className="card card-lg empty">
        <StateArt name="sem-noticias" />
        <h2 className="h-display">Nenhuma notícia publicada agora</h2>
        <p className="muted">As fontes consultadas não publicaram notícias de economia recentes. A lista é atualizada a cada 30 minutos.</p>
      </section>
    );
  }

  const visible = source ? items.filter((item) => item.source.key === source) : items;

  return (
    <div className="stack">
      <p className="muted news-intro">
        Notícias de economia de fontes públicas, com link para o texto original. Nenhum dado seu é enviado para buscá-las.
      </p>
      {sources.length > 1 && (
        <fieldset className="row-tight news-filter">
          <legend className="sr-only">Filtrar por fonte</legend>
          <button type="button" className="chip-toggle" aria-pressed={source === null} onClick={() => setSource(null)}>
            Todas as fontes
          </button>
          {sources.map(([key, name]) => (
            <button key={key} type="button" className="chip-toggle" aria-pressed={source === key} onClick={() => setSource(key)}>
              {name}
            </button>
          ))}
        </fieldset>
      )}
      <ul className="list-plain card card-flush news-list">
        {visible.map((item) => (
          <NewsRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}
