import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { AutoSubmit } from '../../components/lp/form-helpers';
import { Icon } from '../../components/lp/icon';
import { NoticeBar, SiteShell } from '../../components/lp/site-shell';
import { TurnstileWidget } from '../../components/lp/turnstile-widget';
import { formatLongDate } from '../../server/community-forms';
import { LEGAL_VERSIONS } from '../../server/legal';
import { safeReturn } from '../../server/return-to';
import { REFRESH_COOKIE } from '../../server/session';
import { turnstileSiteKey } from '../../server/turnstile';

export const metadata: Metadata = {
  title: 'Entrar · Talentum',
  description: 'Entre com a sua conta Google para baixar o Talentum e participar da comunidade.',
  robots: { index: false, follow: false },
};

const ERRORS = {
  desafio: 'Não foi possível confirmar que a entrada veio de uma pessoa. Conclua a verificação e selecione Continuar com Google de novo.',
  indisponivel: 'O serviço de entrada não respondeu. Nada foi alterado. Tente de novo em alguns minutos.',
  limite: 'Muitas tentativas de entrada em pouco tempo. Aguarde alguns minutos e tente de novo.',
  sessao: 'Sua sessão terminou. Entre de novo para continuar.',
  desktop: 'O link de entrada do aplicativo expirou ou já foi usado. Volte ao Talentum no computador e selecione Entrar com Google de novo.',
} as const;

type Search = { retorno?: string | string[]; erro?: string | string[]; conta?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const retorno = safeReturn(first(params.retorno));
  const erro = first(params.erro);
  const errorText = erro && Object.hasOwn(ERRORS, erro) ? ERRORS[erro as keyof typeof ERRORS] : null;
  const deleted = first(params.conta) === 'excluida';
  const jar = await cookies();
  // Com o cookie de renovação, a sessão é retomada por POST (checagem de origem
  // no BFF), nunca por um GET que outro site poderia disparar. Sessão vencida
  // (`erro=sessao`) é exatamente o caso de retomar; depois de qualquer outro
  // erro a página não tenta de novo sozinha, para não repetir a falha em laço.
  const resume = jar.has(REFRESH_COOKIE) && (!errorText || erro === 'sessao') && !deleted;

  if (resume) {
    return (
      <SiteShell area="entrar">
        <section className="lp-wrap lp-page lp-page-narrow lp-resume" aria-live="polite">
          <h1 className="lp-h-display">Retomando sua sessão</h1>
          <p className="lp-muted">Só um instante. Se nada acontecer, selecione Continuar sessão.</p>
          <form method="post" action="/api/auth/refresh">
            <input type="hidden" name="retorno" value={retorno} />
            <AutoSubmit />
            <button type="submit" className="lp-btn lp-btn-primary">
              Continuar sessão
            </button>
          </form>
        </section>
      </SiteShell>
    );
  }

  const version = formatLongDate(LEGAL_VERSIONS.terms);

  return (
    <SiteShell area="entrar">
      <section className="lp-wrap lp-page lp-page-narrow">
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">Entrar no Talentum</h1>
          <p className="lp-lede">A conta libera os instaladores do aplicativo e a participação na comunidade de sugestões.</p>
        </header>

        {deleted ? <NoticeBar notice={{ tone: 'ok', text: 'Sua conta foi excluída e todas as sessões foram encerradas.' }} /> : null}
        {errorText ? <NoticeBar notice={{ tone: 'warn', text: errorText }} /> : null}

        <div className="lp-panel-card">
          <h2 className="lp-h-display">O que a conta guarda</h2>
          <ul className="lp-plain-list">
            <li>
              <Icon name="bi-check2" />
              E-mail e nome da sua conta Google, para reconhecer você na próxima entrada.
            </li>
            <li>
              <Icon name="bi-check2" />
              As sessões abertas, para você poder encerrá-las em Minha conta.
            </li>
            <li>
              <Icon name="bi-shield-lock" />
              Nenhum dado financeiro. Extratos, saldos e lançamentos ficam só no seu computador.
            </li>
          </ul>

          <form method="post" action="/api/auth/start" className="lp-form">
            <input type="hidden" name="retorno" value={retorno} />
            <TurnstileWidget siteKey={turnstileSiteKey()} action="login" />
            <button type="submit" className="lp-btn lp-btn-primary lp-btn-wide">
              Continuar com Google
              <Icon name="bi-arrow-right" />
            </button>
            <p className="lp-tiny lp-muted">
              Ao continuar, você aceita os <a href="/termos">Termos de Uso</a> e declara ter lido a{' '}
              <a href="/privacidade">Política de Privacidade</a> (versão de {version}).
            </p>
          </form>
        </div>
      </section>
    </SiteShell>
  );
}
