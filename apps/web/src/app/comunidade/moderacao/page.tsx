import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ModerationForm } from '../../../components/lp/community';
import { NoticeBar, SiteShell } from '../../../components/lp/site-shell';
import { readWorker } from '../../../server/community-bff';
import { formatLongDate, noticeFrom } from '../../../server/community-forms';
import type { Report } from '../../../server/community-types';

export const metadata: Metadata = { title: 'Moderação · Talentum', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/* Fila de denúncias abertas. Quem não tem o papel de moderação recebe 403 do
   Worker e vê só a explicação; a página não decide permissão alguma. */
export default async function Page({ searchParams }: { searchParams: Promise<{ aviso?: string | string[] }> }) {
  const { aviso } = await searchParams;
  const result = await readWorker<{ reports: Report[] }>('/api/feedback/moderation/reports');
  if (!result.ok && result.status === 401) redirect('/entrar?retorno=%2Fcomunidade&erro=sessao');

  return (
    <SiteShell area="comunidade">
      <div className="lp-wrap lp-page lp-page-narrow">
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">Moderação</h1>
          <p className="lp-muted">Denúncias abertas, da mais antiga para a mais recente. Cada decisão fica registrada com o motivo.</p>
        </header>
        <NoticeBar notice={noticeFrom(aviso)} />
        {!result.ok ? (
          <p className="lp-muted" role="alert">
            {result.status === 403
              ? 'Sua conta não tem permissão de moderação.'
              : 'O serviço da comunidade não respondeu. Tente de novo em alguns minutos.'}
          </p>
        ) : result.data.reports.length === 0 ? (
          <p className="lp-muted">Nenhuma denúncia aberta.</p>
        ) : (
          <ol className="lp-report-list">
            {result.data.reports.map((report) => (
              <li key={report.id} className="lp-panel-card">
                <p className="lp-post-meta">
                  <strong>{report.target.type === 'POST' ? 'Sugestão' : 'Comentário'}</strong>
                  <span aria-hidden="true">·</span>
                  <span>denunciado em {formatLongDate(report.createdAt)}</span>
                </p>
                <blockquote className="lp-user-text lp-report-preview">{report.target.preview}</blockquote>
                <p>
                  <strong>Motivo:</strong> <span className="lp-user-text">{report.reason}</span>
                </p>
                <p>
                  <a href={`/comunidade/${encodeURIComponent(report.target.postId)}`}>Abrir a sugestão</a>
                </p>
                <ModerationForm
                  label="Decidir"
                  actions={['HIDE', 'DISMISS']}
                  back="fila"
                  reportId={report.id}
                  postId={report.target.postId}
                  commentId={report.target.type === 'COMMENT' ? report.target.id : undefined}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </SiteShell>
  );
}
