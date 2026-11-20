import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PostCard } from '../../../../components/lp/community';
import { Icon } from '../../../../components/lp/icon';
import { SiteShell } from '../../../../components/lp/site-shell';
import { readWorker } from '../../../../server/community-bff';
import { formatMonthYear, isOpaqueId, plural } from '../../../../server/community-forms';
import type { ProfilePage } from '../../../../server/community-types';

export const metadata: Metadata = { title: 'Perfil na comunidade · Talentum', robots: { index: false, follow: true } };
export const dynamic = 'force-dynamic';

/* Perfil público mínimo: nome público, mês de entrada e sugestões publicadas.
   Nunca e-mail, foto, identificador do Google ou sessão. */
export default async function Page({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  if (!isOpaqueId(profileId)) notFound();
  const result = await readWorker<ProfilePage>(`/api/feedback/profiles/${profileId}`);
  if (!result.ok && result.status === 404) notFound();

  return (
    <SiteShell area="comunidade">
      <div className="lp-wrap lp-page lp-page-narrow">
        <p className="lp-back">
          <a href="/comunidade">
            <Icon name="bi-arrow-left" />
            Todas as sugestões
          </a>
        </p>
        {!result.ok ? (
          <section className="lp-empty" role="alert">
            <h1 className="lp-h-display-lg">Não foi possível carregar este perfil</h1>
            <p className="lp-muted">O serviço da comunidade não respondeu. Tente de novo em alguns minutos.</p>
          </section>
        ) : (
          <>
            <header className="lp-page-head">
              <h1 className="lp-h-display-lg">{result.data.profile.publicName}</h1>
              <p className="lp-muted">
                Na comunidade desde {formatMonthYear(result.data.profile.memberSince)} ·{' '}
                {plural(result.data.posts.length, 'sugestão publicada', 'sugestões publicadas')}
              </p>
            </header>
            {result.data.posts.length === 0 ? (
              <p className="lp-muted">Esta pessoa ainda não publicou sugestões.</p>
            ) : (
              <ol className="lp-post-list">
                {result.data.posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </SiteShell>
  );
}
