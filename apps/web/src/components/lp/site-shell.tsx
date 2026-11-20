/* Moldura das páginas internas do site: comunidade, conta, entrada e
   documentos. A página inicial tem cabeçalho próprio (landing-page.tsx).

   Navegação segue o padrão de sites de produto: marca à esquerda levando ao
   início, poucos destinos fixos à direita e, em telas estreitas, um menu
   recolhível (o mesmo padrão `Seções` da página inicial). O destino da conta
   muda conforme existe sessão: `Minha conta` ou `Entrar`.

   scripts/gerar-icones-lp.mjs só lê components/lp. Ícones usados apenas pelas
   páginas de app/ ficam listados aqui para entrarem no mapa: bi-box-arrow-right
   bi-eye-slash bi-arrow-left bi-pencil bi-shield-lock bi-check2 bi-arrow-right. */

import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../server/session';
import { Icon } from './icon';

type Area = 'comunidade' | 'downloads' | 'conta' | 'entrar' | 'documentos';

export async function SiteShell({ area, children }: { area: Area; children: ReactNode }) {
  const jar = await cookies();
  const signedIn = jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE);
  const links: { href: string; label: string; key: Area }[] = [
    { href: '/comunidade', label: 'Comunidade', key: 'comunidade' },
    { href: '/downloads', label: 'Downloads', key: 'downloads' },
    signedIn ? { href: '/conta', label: 'Minha conta', key: 'conta' } : { href: '/entrar', label: 'Entrar', key: 'entrar' },
  ];
  const nav = links.map((link) => (
    <a key={link.href} href={link.href} aria-current={link.key === area ? 'page' : undefined}>
      {link.label}
    </a>
  ));

  return (
    <div className="lp-root lp-shell">
      <a className="lp-skip" href="#conteudo">
        Ir para o conteúdo
      </a>
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <a className="lp-brand" href="/" aria-label="Talentum, página inicial">
            <img src="/marca/talentum-escura.svg" alt="" width={39} height={34} decoding="async" />
            <span className="lp-brand-name">Talentum</span>
          </a>
          <nav className="lp-shell-nav" aria-label="Site">
            {nav}
          </nav>
          <details className="lp-shell-menu">
            <summary>
              <Icon name="bi-list" />
              Menu
            </summary>
            <nav className="lp-shell-menu-list" aria-label="Site">
              {nav}
            </nav>
          </details>
        </div>
      </header>

      <main id="conteudo" className="lp-shell-main">
        {children}
      </main>

      <footer className="lp-shell-footer">
        <div className="lp-wrap lp-shell-footer-inner">
          <span>Talentum · projeto de código aberto em fase pré-alpha.</span>
          <ul>
            <li>
              <a href="/termos">Termos de Uso</a>
            </li>
            <li>
              <a href="/privacidade">Privacidade e LGPD</a>
            </li>
            <li>
              <a href="https://github.com/luizfelipe-pacifico/talentum" target="_blank" rel="noreferrer noopener">
                Repositório
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

/** Aviso de resultado de um envio, no topo do conteúdo. */
export function NoticeBar({ notice }: { notice: { tone: 'ok' | 'warn'; text: string } | null }) {
  if (!notice) return null;
  return (
    <p className={notice.tone === 'ok' ? 'lp-notice lp-notice-ok' : 'lp-notice lp-notice-warn'} role="status">
      <Icon name={notice.tone === 'ok' ? 'bi-check2-circle' : 'bi-exclamation-triangle'} />
      <span>{notice.text}</span>
    </p>
  );
}
