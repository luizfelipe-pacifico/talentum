import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SubmitButton } from '../../../components/lp/form-helpers';
import { NoticeBar, SiteShell } from '../../../components/lp/site-shell';

export const metadata: Metadata = {
  title: 'Verificação em duas etapas · Talentum',
  robots: { index: false, follow: false },
};

/* Segunda etapa da entrada. O cookie `__Host-talentum-mfa` é gravado pelo BFF
   (POST /api/auth/callback) quando a conta tem verificação ativa; sem ele não
   existe entrada pendente para concluir. */
const MFA_COOKIE = '__Host-talentum-mfa';

const ERRORS = {
  codigo: 'O código não confere. Use o código de 6 dígitos que o app mostra agora, ou um código de recuperação.',
  bloqueado: 'Muitos códigos errados. Aguarde 15 minutos e entre de novo.',
  expirado: 'A etapa de verificação expirou. Entre de novo para receber uma nova.',
} as const;

type Search = { erro?: string | string[]; modo?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const erro = first(params.erro);
  const errorText = erro && Object.hasOwn(ERRORS, erro) ? ERRORS[erro as keyof typeof ERRORS] : null;
  const recovery = first(params.modo) === 'recuperacao';
  const pending = (await cookies()).has(MFA_COOKIE);

  if (!pending) {
    return (
      <SiteShell area="entrar">
        <section className="lp-wrap lp-page lp-page-narrow">
          <h1 className="lp-h-display-lg">Sua verificação expirou</h1>
          <p className="lp-lede">A etapa do código dura poucos minutos. Entre de novo com a sua conta Google.</p>
          <a className="lp-btn lp-btn-primary" href="/entrar">
            Entrar de novo
          </a>
        </section>
      </SiteShell>
    );
  }

  return (
    <SiteShell area="entrar">
      <section className="lp-wrap lp-page lp-page-narrow">
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">Verificação em duas etapas</h1>
          <p className="lp-lede">
            {recovery
              ? 'Digite um dos códigos de recuperação que você guardou ao ativar a verificação. Cada código vale uma vez.'
              : 'Abra o app autenticador e digite o código de 6 dígitos do Talentum.'}
          </p>
        </header>
        {errorText ? <NoticeBar notice={{ tone: 'warn', text: errorText }} /> : null}
        <form method="post" action="/api/auth/mfa" className="lp-panel-card lp-form">
          {recovery ? (
            <label className="lp-field">
              <span>Código de recuperação</span>
              <input
                name="recoveryCode"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={9}
                pattern="[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}"
                placeholder="ABCD-1234"
                className="lp-input lp-input-code"
              />
            </label>
          ) : (
            <label className="lp-field">
              <span>Código do app</span>
              <input
                name="code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                className="lp-input lp-input-code"
              />
            </label>
          )}
          <SubmitButton pendingLabel="Verificando código">Verificar código</SubmitButton>
        </form>
        <p className="lp-muted lp-page-aside">
          {recovery ? (
            <a href="/entrar/verificacao">Usar o código do app autenticador</a>
          ) : (
            <a href="/entrar/verificacao?modo=recuperacao">Usar um código de recuperação</a>
          )}
        </p>
      </section>
    </SiteShell>
  );
}
