import type { ReactNode } from 'react';
import { formatLongDate } from '../../server/community-forms';
import { Icon } from './icon';
import { SiteShell } from './site-shell';

/* Página de documento jurídico: título, aviso de minuta, corpo e versão. */
export function LegalPage({ title, version, other, children }: { title: string; version: string; other: { href: string; label: string }; children: ReactNode }) {
  return (
    <SiteShell area="documentos">
      <article className="lp-wrap lp-page lp-page-prose">
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">{title}</h1>
          <p className="lp-muted">Versão de {formatLongDate(version)}</p>
        </header>
        <p className="lp-legal-aviso">
          <Icon name="bi-exclamation-triangle" />
          <span>
            Minuta em revisão jurídica. O texto descreve o que o Talentum faz hoje, mas ainda não foi revisado por advogado.
          </span>
        </p>
        <div className="lp-legal-doc lp-legal-page">{children}</div>
        <p className="lp-legal-meta">
          Versão de {formatLongDate(version)}. Leia também: <a href={other.href}>{other.label}</a>.
        </p>
      </article>
    </SiteShell>
  );
}
