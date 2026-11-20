import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AuthorLink, CommentForm, CommentThread, Disclosure, ModerationForm, PostVote, ReportForm } from '../../../components/lp/community';
import { SubmitButton } from '../../../components/lp/form-helpers';
import { Icon } from '../../../components/lp/icon';
import { NoticeBar, SiteShell } from '../../../components/lp/site-shell';
import { StateArt } from '../../../components/lp/state-art';
import { readWorker } from '../../../server/community-bff';
import { formatLongDate, isOpaqueId, LIMITS, noticeFrom, plural } from '../../../server/community-forms';
import type { PostPage } from '../../../server/community-types';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../../server/session';
import { turnstileSiteKey } from '../../../server/turnstile';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ postId: string }>; searchParams: Promise<{ aviso?: string | string[] }> };

async function load(postId: string) {
  return isOpaqueId(postId) ? readWorker<PostPage>(`/api/feedback/posts/${postId}`) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { postId } = await params;
  const result = await load(postId);
  if (!result?.ok) return { title: 'Sugestão · Talentum', robots: { index: false } };
  return { title: `${result.data.post.title} · Comunidade Talentum`, description: result.data.post.excerpt, alternates: { canonical: `/comunidade/${postId}` } };
}

export default async function Page({ params, searchParams }: Props) {
  const { postId } = await params;
  const { aviso } = await searchParams;
  const result = await load(postId);
  if (!result || (!result.ok && result.status === 404)) notFound();
  if (!result.ok) {
    return (
      <SiteShell area="comunidade">
        <section className="lp-wrap lp-page lp-empty" role="alert">
          <StateArt name="erro-tela" />
          <h1 className="lp-h-display-lg">Não foi possível carregar esta sugestão</h1>
          <p className="lp-muted">O serviço da comunidade não respondeu. Tente de novo em alguns minutos.</p>
          <a className="lp-btn" href={`/comunidade/${postId}`}>
            Carregar de novo
          </a>
        </section>
      </SiteShell>
    );
  }

  const { post, comments, viewerCanModerate } = result.data;
  const jar = await cookies();
  const signedIn = jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE);
  const locked = post.status !== 'PUBLISHED';
  const siteKey = turnstileSiteKey();
  const postActions: ('HIDE' | 'RESTORE' | 'CLOSE' | 'REOPEN')[] =
    post.status === 'HIDDEN' ? ['RESTORE'] : post.status === 'CLOSED' ? ['REOPEN', 'HIDE'] : ['CLOSE', 'HIDE'];
  const visibleComments = comments.filter((comment) => comment.status !== 'DELETED' || comments.some((other) => other.parentCommentId === comment.id)).length;

  return (
    <SiteShell area="comunidade">
      <div className="lp-wrap lp-page lp-page-narrow">
        <p className="lp-back">
          <a href="/comunidade">
            <Icon name="bi-arrow-left" />
            Todas as sugestões
          </a>
        </p>
        <NoticeBar notice={noticeFrom(aviso)} />

        <article className="lp-post" aria-labelledby="titulo-sugestao">
          <header className="lp-page-head">
            <h1 className="lp-h-display-lg" id="titulo-sugestao">
              {post.title}
            </h1>
            <p className="lp-post-meta">
              <AuthorLink author={post.author} />
              <span aria-hidden="true">·</span>
              <time dateTime={post.createdAt}>{formatLongDate(post.createdAt)}</time>
              {post.updatedAt !== post.createdAt ? <span className="lp-muted">(editada)</span> : null}
              {post.status === 'CLOSED' ? <span className="lp-chip lp-chip-sm">Encerrada: não recebe comentários</span> : null}
              {post.status === 'HIDDEN' ? <span className="lp-chip lp-chip-sm">Oculta pela moderação</span> : null}
            </p>
          </header>
          <p className="lp-user-text lp-post-body">{post.body}</p>

          <div className="lp-post-actions" id="apoio">
            <PostVote postId={post.id} voted={post.viewerHasVoted} count={post.voteCount} signedIn={signedIn && !locked} />
            {post.viewerIsAuthor && !locked ? (
              <>
                <Disclosure label="Editar" icon="bi-pencil">
                  <form method="post" action={`/api/comunidade/publicacoes/${encodeURIComponent(post.id)}/editar`} className="lp-form">
                    <label className="lp-field">
                      <span>Título</span>
                      <input name="titulo" className="lp-input" required minLength={LIMITS.title.min} maxLength={LIMITS.title.max} defaultValue={post.title} />
                    </label>
                    <label className="lp-field">
                      <span>Descrição</span>
                      <textarea name="texto" className="lp-input" rows={8} required minLength={LIMITS.body.min} maxLength={LIMITS.body.max} defaultValue={post.body} />
                    </label>
                    <SubmitButton className="lp-btn lp-btn-sm" pendingLabel="Salvando alteração">
                      Salvar alteração
                    </SubmitButton>
                  </form>
                </Disclosure>
                <Disclosure label="Excluir" icon="bi-trash">
                  <form method="post" action={`/api/comunidade/publicacoes/${encodeURIComponent(post.id)}/excluir`} className="lp-form">
                    <p className="lp-tiny lp-muted">
                      A sugestão sai da lista e o texto é apagado. Os comentários de outras pessoas deixam de aparecer. Não dá para desfazer.
                    </p>
                    <SubmitButton className="lp-btn lp-btn-sm lp-btn-danger" pendingLabel="Excluindo sugestão">
                      Excluir sugestão
                    </SubmitButton>
                  </form>
                </Disclosure>
              </>
            ) : null}
            {signedIn && !post.viewerIsAuthor ? <ReportForm postId={post.id} siteKey={siteKey} /> : null}
            {viewerCanModerate ? <ModerationForm actions={postActions} postId={post.id} /> : null}
          </div>
        </article>

        <section className="lp-comments" id="comentarios" aria-labelledby="comentarios-titulo">
          <h2 className="lp-h-display" id="comentarios-titulo">
            {plural(visibleComments, 'comentário', 'comentários')}
          </h2>
          <div id="comentar">
            {locked ? (
              <p className="lp-muted">Esta sugestão não recebe novos comentários.</p>
            ) : signedIn ? (
              <CommentForm postId={post.id} siteKey={siteKey} label="Seu comentário" submit="Publicar comentário" />
            ) : (
              <p className="lp-muted">
                <a href="/entrar?retorno=%2Fcomunidade">Entre na sua conta</a> para comentar e apoiar sugestões.
              </p>
            )}
          </div>
          {comments.length > 0 ? (
            <CommentThread postId={post.id} comments={comments} signedIn={signedIn} canModerate={viewerCanModerate} locked={locked} siteKey={siteKey} />
          ) : (
            <p className="lp-muted">Nenhum comentário ainda.</p>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
