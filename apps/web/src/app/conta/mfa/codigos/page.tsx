import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoticeBar, SiteShell } from '../../../../components/lp/site-shell';
import { forwardForm } from '../../../../server/community-bff';
import { noticeFrom } from '../../../../server/community-forms';

export const metadata: Metadata = { title: 'Códigos de recuperação · Talentum', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/* Mostra os códigos de recuperação uma única vez. A revelação é um POST do
   servidor da LP ao Worker durante a renderização (servidor a servidor; o
   navegador recebe só o HTML, sem cache). Recarregar a página não mostra os
   códigos de novo: o Worker os entrega uma vez só. */
export default async function Page({ searchParams }: { searchParams: Promise<{ aviso?: string | string[] }> }) {
  const { aviso } = await searchParams;
  const reveal = await forwardForm('/api/me/mfa/recovery-codes/reveal', 'POST', {});
  if (!reveal.ok && reveal.notice === 'sessao') redirect('/entrar?retorno=%2Fconta&erro=sessao');
  const codes = reveal.ok && Array.isArray(reveal.data.recoveryCodes) ? (reveal.data.recoveryCodes as unknown[]).filter((code): code is string => typeof code === 'string') : null;

  return (
    <SiteShell area="conta">
      <div className="lp-wrap lp-page lp-page-narrow">
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">Códigos de recuperação</h1>
        </header>
        <NoticeBar notice={noticeFrom(aviso)} />
        {codes && codes.length > 0 ? (
          <section className="lp-panel-card">
            <p>
              Guarde estes códigos fora do computador, em papel ou num gerenciador de senhas. Se você perder o celular, cada
              código permite <strong>uma</strong> entrada no lugar do código do app.
            </p>
            <ol className="lp-recovery-codes">
              {codes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ol>
            <p className="lp-callout lp-callout-warn">Esta é a única vez que os códigos aparecem. Ao sair desta página, eles não são mostrados de novo.</p>
            <a className="lp-btn lp-btn-primary" href="/conta">
              Guardei os códigos
            </a>
          </section>
        ) : (
          <section className="lp-panel-card">
            <p>Não há códigos para mostrar. Eles aparecem uma única vez, logo depois de gerados.</p>
            <p className="lp-muted">Se você não guardou os códigos, gere novos em Minha conta; os anteriores deixam de valer.</p>
            <a className="lp-btn" href="/conta#verificacao">
              Voltar para Minha conta
            </a>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
