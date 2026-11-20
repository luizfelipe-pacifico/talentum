import type { Metadata } from 'next';
import { FormChallenge, SubmitButton } from '../../../components/lp/form-helpers';
import { Icon } from '../../../components/lp/icon';
import { NoticeBar, SiteShell } from '../../../components/lp/site-shell';
import { LIMITS, noticeFrom } from '../../../server/community-forms';
import { turnstileSiteKey } from '../../../server/turnstile';

export const metadata: Metadata = { title: 'Escrever sugestão · Talentum', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/* Página privada: o middleware manda para /entrar quem chega sem sessão. */
export default async function Page({ searchParams }: { searchParams: Promise<{ aviso?: string | string[] }> }) {
  const { aviso } = await searchParams;
  return (
    <SiteShell area="comunidade">
      <div className="lp-wrap lp-page lp-page-narrow">
        <p className="lp-back">
          <a href="/comunidade">
            <Icon name="bi-arrow-left" />
            Todas as sugestões
          </a>
        </p>
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">Escrever sugestão</h1>
          <p className="lp-lede">Descreva o problema que você encontrou ou a melhoria que gostaria de ver no Talentum.</p>
        </header>
        <NoticeBar notice={noticeFrom(aviso)} />

        <form method="post" action="/api/comunidade/publicacoes" className="lp-panel-card lp-form">
          <input type="hidden" name="chave" value={crypto.randomUUID()} />
          <label className="lp-field">
            <span>Título</span>
            <input name="titulo" className="lp-input" required minLength={LIMITS.title.min} maxLength={LIMITS.title.max} autoComplete="off" />
            <small className="lp-muted">Uma frase que resuma a sugestão, de 5 a 120 caracteres.</small>
          </label>
          <label className="lp-field">
            <span>Descrição</span>
            <textarea name="texto" className="lp-input" rows={10} required minLength={LIMITS.body.min} maxLength={LIMITS.body.max} />
            <small className="lp-muted">Texto simples, até 4.000 caracteres. Links não ficam clicáveis.</small>
          </label>
          <p className="lp-callout lp-callout-warn">
            <Icon name="bi-eye-slash" />
            <span>A sugestão fica pública com o seu nome público. Não inclua valores, extratos, documentos nem dados de outras pessoas.</span>
          </p>
          <FormChallenge siteKey={turnstileSiteKey()} action="community" />
          <SubmitButton pendingLabel="Publicando sugestão">Publicar sugestão</SubmitButton>
        </form>
      </div>
    </SiteShell>
  );
}
