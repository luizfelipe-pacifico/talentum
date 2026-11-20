import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Icon } from '../../components/lp/icon';
import { SiteShell } from '../../components/lp/site-shell';
import { StateArt } from '../../components/lp/state-art';
import { cloud } from '../../server/cloudflare';

/* Downloads autorizados (MVP 1). Exige sessão: o middleware leva a /entrar e
   o Worker confirma a sessão em /api/me. Cada plataforma tem seu cartão, com
   ou sem versão publicada: Windows, Linux e macOS. O macOS só recebe botão
   quando houver build assinado e notarizado; até lá, "Em breve". */

type Platform = 'WINDOWS' | 'LINUX' | 'MACOS';
type Release = { id: string; version: string; channel: string; artifactId: string; platform: Platform; architecture: string; sha256: string };

export const metadata: Metadata = { title: 'Downloads · Talentum', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PLATFORMS: { key: Platform; name: string; icon: string; pending: string }[] = [
  { key: 'WINDOWS', name: 'Windows', icon: 'bi-windows', pending: 'Nenhum instalador para Windows foi publicado ainda.' },
  { key: 'LINUX', name: 'Linux', icon: 'bi-ubuntu', pending: 'Nenhum AppImage para Linux foi publicado ainda.' },
  {
    key: 'MACOS',
    name: 'macOS',
    icon: 'bi-apple',
    pending: 'Em breve. O instalador para Mac só é publicado depois de assinado e notarizado pela Apple.',
  },
];

const CHANNEL: Record<string, string> = { STABLE: 'estável', BETA: 'beta' };

export default async function Page() {
  const me = await cloud('/api/me', {}, true);
  if (!me.ok) redirect('/entrar?retorno=%2Fdownloads');
  const result = await cloud('/api/releases', {}, true);
  const items = result.ok ? ((await result.json()) as { releases: Release[] }).releases : [];

  return (
    <SiteShell area="downloads">
      <div className="lp-wrap lp-page">
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">Baixar o Talentum</h1>
          <p className="lp-muted">
            Escolha o seu sistema. Depois de baixar, confira o SHA-256 do arquivo com o valor mostrado aqui antes de abrir o
            instalador.
          </p>
        </header>

        {!result.ok && (
          <p className="lp-notice lp-notice-warn" role="status">
            Não foi possível consultar as versões agora. Tente de novo em alguns minutos.
          </p>
        )}
        {result.ok && items.length === 0 && (
          <div className="lp-status">
            <StateArt name="sem-versoes" />
            <p>Nenhuma versão foi publicada ainda. Os instaladores aparecem aqui assim que forem assinados.</p>
          </div>
        )}

        <div className="lp-download-grid">
          {PLATFORMS.map((platform) => {
            const artifacts = items.filter((item) => item.platform === platform.key);
            return (
              <section key={platform.key} className="lp-panel-card lp-download-card" aria-labelledby={`plataforma-${platform.key}`}>
                <h2 className="lp-h-display" id={`plataforma-${platform.key}`}>
                  <Icon name={platform.icon} />
                  {platform.name}
                </h2>
                {artifacts.length === 0 ? (
                  <p className="lp-muted">{platform.pending}</p>
                ) : (
                  artifacts.map((artifact) => (
                    <div key={artifact.artifactId} className="lp-download-item">
                      <p>
                        Versão {artifact.version} ({CHANNEL[artifact.channel] ?? artifact.channel}) · {artifact.architecture}
                      </p>
                      <p className="lp-muted">SHA-256</p>
                      <code className="lp-hash">{artifact.sha256}</code>
                      <form action={`/api/releases/${encodeURIComponent(artifact.id)}/download-grants`} method="post">
                        <input type="hidden" name="artifactId" value={artifact.artifactId} />
                        <button type="submit" className="lp-btn lp-btn-primary">
                          <Icon name="bi-download" />
                          Baixar para {platform.name} ({artifact.architecture})
                        </button>
                      </form>
                    </div>
                  ))
                )}
              </section>
            );
          })}
        </div>
      </div>
    </SiteShell>
  );
}
