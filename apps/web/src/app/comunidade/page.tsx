import type { Metadata } from 'next';
import { PostCard } from '../../components/lp/community';
import { Icon } from '../../components/lp/icon';
import { NoticeBar, SiteShell } from '../../components/lp/site-shell';
import { StateArt } from '../../components/lp/state-art';
import { readWorker } from '../../server/community-bff';
import { noticeFrom } from '../../server/community-forms';
import type { PostList } from '../../server/community-types';

export const metadata: Metadata = {
  title: 'Comunidade de sugestões · Talentum',
  description: 'Sugestões públicas para o Talentum: proponha melhorias, comente e apoie as ideias de outras pessoas.',
  alternates: { canonical: '/comunidade' },
};
export const dynamic = 'force-dynamic';

type Search = { ordem?: string | string[]; cursor?: string | string[]; aviso?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const CURSOR = /^[A-Za-z0-9_.:=-]{1,200}$/;

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const sort = first(params.ordem) === 'apoios' ? 'votes' : 'recent';
  const rawCursor = first(params.cursor);
  const cursor = rawCursor && CURSOR.test(rawCursor) ? rawCursor : null;
  const query = new URLSearchParams({ sort, ...(cursor ? { cursor } : {}) });
  const result = await readWorker<PostList>(`/api/feedback/posts?${query}`);
  const sortParam = sort === 'votes' ? 'apoios' : 'recentes';

  return (
    <SiteShell area="comunidade">
      <div className="lp-wrap lp-page">
        <header className="lp-page-head lp-page-head-row">
          <div>
            <h1 className="lp-h-display-lg">Comunidade de sugestões</h1>
            <p className="lp-lede">Proponha melhorias para o Talentum, comente e apoie as ideias de outras pessoas.</p>
          </div>
          <a className="lp-btn lp-btn-primary" href="/comunidade/nova">
            <Icon name="bi-pencil" />
            Escrever sugestão
          </a>
        </header>
        <NoticeBar notice={noticeFrom(params.aviso)} />

        <nav className="lp-tabs" aria-label="Ordenar sugestões">
          <a href="/comunidade" aria-current={sort === 'recent' ? 'page' : undefined}>
            Mais recentes
          </a>
          <a href="/comunidade?ordem=apoios" aria-current={sort === 'votes' ? 'page' : undefined}>
            Mais apoiadas
          </a>
        </nav>

        {!result.ok ? (
          <section className="lp-empty" role="alert">
            <StateArt name="erro-tela" />
            <h2 className="lp-h-display">Não foi possível carregar as sugestões</h2>
            <p className="lp-muted">O serviço da comunidade não respondeu. Tente de novo em alguns minutos.</p>
            <a className="lp-btn" href={`/comunidade?ordem=${sortParam}`}>
              Carregar de novo
            </a>
          </section>
        ) : result.data.posts.length === 0 ? (
          <section className="lp-empty">
            <h2 className="lp-h-display">{cursor ? 'Não há sugestões mais antigas' : 'Nenhuma sugestão publicada ainda'}</h2>
            <p className="lp-muted">
              {cursor ? 'Você chegou ao fim da lista.' : 'Conte o que falta no Talentum ou o que poderia funcionar melhor.'}
            </p>
            <a className="lp-btn lp-btn-primary" href={cursor ? '/comunidade' : '/comunidade/nova'}>
              {cursor ? 'Voltar ao início da lista' : 'Escrever sugestão'}
            </a>
          </section>
        ) : (
          <>
            <ol className="lp-post-list">
              {result.data.posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </ol>
            {result.data.nextCursor && CURSOR.test(result.data.nextCursor) ? (
              <p className="lp-pager">
                <a className="lp-btn" href={`/comunidade?ordem=${sortParam}&cursor=${encodeURIComponent(result.data.nextCursor)}`}>
                  Ver sugestões mais antigas
                </a>
              </p>
            ) : null}
          </>
        )}
      </div>
    </SiteShell>
  );
}
