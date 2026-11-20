/* Peças da comunidade de sugestões (Stage 20 de docs/ROADMAP.md).

   Todo texto de pessoas chega como texto puro e é renderizado pelo React, que
   escapa HTML; quebras de linha vêm do CSS (`white-space: pre-line`). Nada aqui
   usa HTML vindo do Worker, e nenhum link dentro do texto vira link clicável.

   Padrões seguidos: lista com ordenação em abas e "carregar mais antigas"
   (GitHub Discussions, Reddit), apoio com contagem ao lado do título, respostas
   em um único nível sob o comentário (YouTube), ações secundárias recolhidas
   em blocos que abrem no próprio lugar. */

import type { ReactNode } from 'react';
import { formatLongDate, LIMITS, type MODERATION_ACTIONS, plural } from '../../server/community-forms';
import type { Comment, PostSummary } from '../../server/community-types';
import { FormChallenge, SubmitButton } from './form-helpers';
import { Icon } from './icon';

export function AuthorLink({ author }: { author: { profileId: string; publicName: string } | null }) {
  if (!author) return <span className="lp-muted">Pessoa que excluiu a conta</span>;
  return <a href={`/comunidade/pessoa/${encodeURIComponent(author.profileId)}`}>{author.publicName}</a>;
}

export function PostCard({ post }: { post: PostSummary }) {
  return (
    <li className="lp-post-card">
      <p className="lp-post-count">
        <Icon name="bi-hand-thumbs-up" />
        <span>{post.voteCount}</span>
        <span className="lp-visually-hidden">{post.voteCount === 1 ? 'apoio' : 'apoios'}</span>
      </p>
      <div className="lp-post-main">
        <h2 className="lp-post-title">
          <a href={`/comunidade/${encodeURIComponent(post.id)}`}>{post.title}</a>
        </h2>
        <p className="lp-post-excerpt">{post.excerpt}</p>
        <p className="lp-post-meta">
          <AuthorLink author={post.author} />
          <span aria-hidden="true">·</span>
          <time dateTime={post.createdAt}>{formatLongDate(post.createdAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{plural(post.commentCount, 'comentário', 'comentários')}</span>
          {post.status === 'CLOSED' ? <span className="lp-chip lp-chip-sm">Encerrada</span> : null}
        </p>
      </div>
    </li>
  );
}

/** Bloco recolhível de ação secundária. */
export function Disclosure({ label, icon, children }: { label: string; icon?: string; children: ReactNode }) {
  return (
    <details className="lp-disclosure">
      <summary>
        {icon ? <Icon name={icon} /> : null}
        {label}
      </summary>
      {children}
    </details>
  );
}

export function ReportForm({ postId, commentId, siteKey }: { postId: string; commentId?: string; siteKey: string | null }) {
  return (
    <Disclosure label="Denunciar" icon="bi-flag">
      <form method="post" action="/api/comunidade/denuncias" className="lp-form">
        <input type="hidden" name="publicacao" value={postId} />
        {commentId ? <input type="hidden" name="comentario" value={commentId} /> : null}
        <input type="hidden" name="chave" value={crypto.randomUUID()} />
        <label className="lp-field">
          <span>O que há de errado com este conteúdo?</span>
          <textarea name="motivo" className="lp-input" rows={3} required minLength={LIMITS.reason.min} maxLength={LIMITS.reason.max} />
        </label>
        <FormChallenge siteKey={siteKey} action="community" />
        <SubmitButton className="lp-btn lp-btn-sm" pendingLabel="Enviando denúncia">
          Enviar denúncia
        </SubmitButton>
      </form>
    </Disclosure>
  );
}

const MODERATION_LABELS: Record<(typeof MODERATION_ACTIONS)[number], string> = {
  HIDE: 'Ocultar',
  RESTORE: 'Restaurar',
  CLOSE: 'Encerrar sugestão',
  REOPEN: 'Reabrir sugestão',
  DISMISS: 'Arquivar denúncia',
};

/** Decisão de moderação com motivo obrigatório; cada decisão fica registrada no Worker. */
export function ModerationForm({
  actions,
  postId,
  commentId,
  reportId,
  back = 'publicacao',
  label = 'Moderar',
}: {
  actions: (typeof MODERATION_ACTIONS)[number][];
  postId?: string;
  commentId?: string;
  reportId?: string;
  back?: 'publicacao' | 'fila';
  label?: string;
}) {
  return (
    <Disclosure label={label} icon="bi-shield-lock">
      <form method="post" action="/api/comunidade/moderacao" className="lp-form">
        {postId ? <input type="hidden" name="publicacao" value={postId} /> : null}
        {commentId ? <input type="hidden" name="comentario" value={commentId} /> : null}
        {reportId ? <input type="hidden" name="denuncia" value={reportId} /> : null}
        <input type="hidden" name="voltar" value={back} />
        <input type="hidden" name="chave" value={crypto.randomUUID()} />
        <fieldset className="lp-choice">
          <legend>Decisão</legend>
          {actions.map((action, index) => (
            <label key={action}>
              <input type="radio" name="acao" value={action} required defaultChecked={index === 0} />
              {MODERATION_LABELS[action]}
            </label>
          ))}
        </fieldset>
        <label className="lp-field">
          <span>Motivo registrado</span>
          <textarea name="motivo" className="lp-input" rows={2} required minLength={LIMITS.reason.min} maxLength={LIMITS.reason.max} />
        </label>
        <SubmitButton className="lp-btn lp-btn-sm" pendingLabel="Registrando decisão">
          Registrar decisão
        </SubmitButton>
      </form>
    </Disclosure>
  );
}

function VoteButton({ action, voted, count, hidden }: { action: string; voted: boolean; count: number; hidden?: Record<string, string> }) {
  return (
    <form method="post" action={action} className="lp-vote-form">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="acao" value={voted ? 'remover' : 'apoiar'} />
      <button type="submit" className={voted ? 'lp-vote lp-vote-on' : 'lp-vote'} aria-pressed={voted}>
        <Icon name={voted ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up'} />
        <span>Apoiar</span>
        <span className="lp-vote-count">{count}</span>
      </button>
    </form>
  );
}

export function PostVote({ postId, voted, count, signedIn }: { postId: string; voted: boolean; count: number; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <p className="lp-vote-static">
        <Icon name="bi-hand-thumbs-up" />
        {plural(count, 'apoio', 'apoios')}
      </p>
    );
  }
  return <VoteButton action={`/api/comunidade/publicacoes/${encodeURIComponent(postId)}/voto`} voted={voted} count={count} />;
}

type ThreadProps = {
  postId: string;
  comments: Comment[];
  signedIn: boolean;
  canModerate: boolean;
  locked: boolean;
  siteKey: string | null;
};

/** Comentários com respostas em um nível. Comentário removido mantém o lugar para a conversa continuar legível. */
export function CommentThread({ postId, comments, signedIn, canModerate, locked, siteKey }: ThreadProps) {
  const roots = comments.filter((comment) => !comment.parentCommentId);
  const replies = (id: string) => comments.filter((comment) => comment.parentCommentId === id);
  return (
    <ol className="lp-thread">
      {roots.map((comment) => (
        <li key={comment.id}>
          <CommentItem postId={postId} comment={comment} signedIn={signedIn} canModerate={canModerate} locked={locked} siteKey={siteKey} canReply />
          {replies(comment.id).length > 0 ? (
            <ol className="lp-thread lp-thread-replies">
              {replies(comment.id).map((reply) => (
                <li key={reply.id}>
                  <CommentItem postId={postId} comment={reply} signedIn={signedIn} canModerate={canModerate} locked={locked} siteKey={siteKey} />
                </li>
              ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function CommentItem({ postId, comment, signedIn, canModerate, locked, siteKey, canReply = false }: Omit<ThreadProps, 'comments'> & { comment: Comment; canReply?: boolean }) {
  const removed = comment.body === null || comment.status === 'DELETED';
  const hidden = comment.status === 'HIDDEN';
  return (
    <article className="lp-comment" id={`comentario-${comment.id}`}>
      <p className="lp-post-meta">
        <strong>
          <AuthorLink author={comment.author} />
        </strong>
        <span aria-hidden="true">·</span>
        <time dateTime={comment.createdAt}>{formatLongDate(comment.createdAt)}</time>
        {hidden ? <span className="lp-chip lp-chip-sm">Oculto pela moderação</span> : null}
      </p>
      {removed ? (
        <p className="lp-comment-removed">Conteúdo removido.</p>
      ) : (
        <p className="lp-user-text">{comment.body}</p>
      )}
      {!removed ? (
        <div className="lp-comment-actions">
          {signedIn && !locked ? (
            <VoteButton
              action={`/api/comunidade/comentarios/${encodeURIComponent(comment.id)}/voto`}
              voted={comment.viewerHasVoted}
              count={comment.voteCount}
              hidden={{ publicacao: postId }}
            />
          ) : (
            <span className="lp-vote-static lp-tiny">
              <Icon name="bi-hand-thumbs-up" />
              {comment.voteCount}
            </span>
          )}
          {signedIn && canReply && !locked ? (
            <Disclosure label="Responder" icon="bi-reply">
              <CommentForm postId={postId} parentId={comment.id} siteKey={siteKey} label="Sua resposta" submit="Publicar resposta" />
            </Disclosure>
          ) : null}
          {comment.viewerIsAuthor && !locked ? (
            <>
              <Disclosure label="Editar" icon="bi-pencil">
                <form method="post" action={`/api/comunidade/comentarios/${encodeURIComponent(comment.id)}/editar`} className="lp-form">
                  <input type="hidden" name="publicacao" value={postId} />
                  <label className="lp-field">
                    <span>Comentário</span>
                    <textarea name="texto" className="lp-input" rows={4} required maxLength={LIMITS.comment.max} defaultValue={comment.body ?? ''} />
                  </label>
                  <SubmitButton className="lp-btn lp-btn-sm" pendingLabel="Salvando alteração">
                    Salvar alteração
                  </SubmitButton>
                </form>
              </Disclosure>
              <Disclosure label="Excluir" icon="bi-trash">
                <form method="post" action={`/api/comunidade/comentarios/${encodeURIComponent(comment.id)}/excluir`} className="lp-form">
                  <input type="hidden" name="publicacao" value={postId} />
                  <p className="lp-tiny lp-muted">O texto é apagado e o lugar mostra “Conteúdo removido”. Não dá para desfazer.</p>
                  <SubmitButton className="lp-btn lp-btn-sm lp-btn-danger" pendingLabel="Excluindo comentário">
                    Excluir comentário
                  </SubmitButton>
                </form>
              </Disclosure>
            </>
          ) : null}
          {signedIn && !comment.viewerIsAuthor ? <ReportForm postId={postId} commentId={comment.id} siteKey={siteKey} /> : null}
          {canModerate ? <ModerationForm actions={hidden ? ['RESTORE'] : ['HIDE']} postId={postId} commentId={comment.id} /> : null}
        </div>
      ) : null}
    </article>
  );
}

export function CommentForm({ postId, parentId, siteKey, label, submit }: { postId: string; parentId?: string; siteKey: string | null; label: string; submit: string }) {
  return (
    <form method="post" action={`/api/comunidade/publicacoes/${encodeURIComponent(postId)}/comentarios`} className="lp-form">
      <input type="hidden" name="chave" value={crypto.randomUUID()} />
      {parentId ? <input type="hidden" name="resposta" value={parentId} /> : null}
      <label className="lp-field">
        <span>{label}</span>
        <textarea name="texto" className="lp-input" rows={parentId ? 3 : 4} required minLength={LIMITS.comment.min} maxLength={LIMITS.comment.max} />
      </label>
      <FormChallenge siteKey={siteKey} action="community" />
      <SubmitButton className="lp-btn lp-btn-primary lp-btn-sm" pendingLabel="Publicando">
        {submit}
      </SubmitButton>
    </form>
  );
}
