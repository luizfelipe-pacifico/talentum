import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Icon } from '../../components/lp/icon';
import { SiteShell } from '../../components/lp/site-shell';
import { StateArt } from '../../components/lp/state-art';
import { cloud } from '../../server/cloudflare';

/* Downloads autorizados (MVP 1). Exige sessão: o middleware leva a /entrar e
   o Worker confirma a sessão em /api/me. Cada plataforma tem seu cartão, com
   ou sem versão publicada: Windows, Linux e macOS. O macOS só recebe botão
   quando houver build assinado e notarizado; até lá, "Em breve".

   Cada pacote diz para quem serve. No Linux o .deb vem primeiro: o Ubuntu 24.04
   e mais novos só abrem o Talentum pelo .deb, que instala o perfil do AppArmor;
   o AppImage serve às demais distribuições (docs/BEST_PRACTICES.md, "Desktop
   packages"). O .zip do Mac existe para a atualização automática e não é
   oferecido aqui. */

type Platform = 'WINDOWS' | 'LINUX' | 'MACOS';
type PackageFormat = 'NSIS' | 'DMG' | 'ZIP' | 'DEB' | 'APPIMAGE';
type Release = {
  id: string;
  version: string;
  channel: string;
  artifactId: string;
  platform: Platform;
  architecture: string;
  packageFormat: PackageFormat;
  sha256: string;
};

const FORMATS: Partial<Record<PackageFormat, { order: number; title: string; file: string; audience: string }>> = {
  NSIS: { order: 0, title: 'Instalador .exe', file: '.exe', audience: 'Windows 10 e 11.' },
  DMG: { order: 0, title: 'Imagem de disco .dmg', file: '.dmg', audience: 'Abra e arraste o Talentum para a pasta Aplicativos.' },
  DEB: { order: 0, title: 'Pacote .deb', file: '.deb', audience: 'Ubuntu, Debian, Linux Mint e Pop!_OS. No Ubuntu 24.04 e mais novos, use este.' },
  APPIMAGE: { order: 1, title: 'AppImage', file: 'AppImage', audience: 'Fedora, Arch, openSUSE e outras distribuições. Não abre no Ubuntu 24.04 e mais novos.' },
};

const MAC_ARCH: Record<string, string> = { arm64: 'Mac com Apple silicon (M1 ou mais novo)', x64: 'Mac com processador Intel' };

export const metadata: Metadata = { title: 'Downloads · Talentum', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PLATFORMS: { key: Platform; name: string; icon: string; pending: string }[] = [
  { key: 'WINDOWS', name: 'Windows', icon: 'bi-windows', pending: 'Nenhum instalador para Windows foi publicado ainda.' },
  { key: 'LINUX', name: 'Linux', icon: 'bi-tux', pending: 'Nenhum pacote para Linux foi publicado ainda.' },
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
            const artifacts = items
              .filter((item) => item.platform === platform.key && FORMATS[item.packageFormat])
              .sort((a, b) => (FORMATS[a.packageFormat]?.order ?? 0) - (FORMATS[b.packageFormat]?.order ?? 0));
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
                        <strong>{platform.key === 'MACOS' ? (MAC_ARCH[artifact.architecture] ?? artifact.architecture) : FORMATS[artifact.packageFormat]?.title}</strong>
                        <br />
                        <span className="lp-muted">{FORMATS[artifact.packageFormat]?.audience}</span>
                      </p>
                      <p className="lp-muted">
                        Versão {artifact.version} · {CHANNEL[artifact.channel] ?? artifact.channel} · {artifact.architecture}
                      </p>
                      <p className="lp-muted">SHA-256</p>
                      <code className="lp-hash">{artifact.sha256}</code>
                      <form action={`/api/releases/${encodeURIComponent(artifact.id)}/download-grants`} method="post">
                        <input type="hidden" name="artifactId" value={artifact.artifactId} />
                        <button
                          type="submit"
                          className="lp-btn lp-btn-primary"
                          aria-label={`Baixar ${FORMATS[artifact.packageFormat]?.title} do Talentum ${artifact.version} para ${platform.name} ${artifact.architecture}`}
                        >
                          <Icon name="bi-download" />
                          Baixar {FORMATS[artifact.packageFormat]?.file}
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
