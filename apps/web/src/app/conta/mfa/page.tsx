import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SubmitButton } from '../../../components/lp/form-helpers';
import { NoticeBar, SiteShell } from '../../../components/lp/site-shell';
import { readWorker } from '../../../server/community-bff';
import { groupSecret, noticeFrom } from '../../../server/community-forms';
import { encodeQr, qrSvgPath } from '../../../server/qr';

export const metadata: Metadata = { title: 'Ativar app autenticador · Talentum', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/* O QR Code é desenhado aqui, no servidor (server/qr.ts): o endereço otpauth
   carrega o segredo e não pode passar por serviço externo de QR. */
export default async function Page({ searchParams }: { searchParams: Promise<{ aviso?: string | string[] }> }) {
  const { aviso } = await searchParams;
  const pending = await readWorker<{ secret: string; otpauthUri: string }>('/api/me/mfa/totp/pending');
  if (!pending.ok) {
    if (pending.status === 401) redirect('/entrar?retorno=%2Fconta&erro=sessao');
    redirect('/conta?aviso=mfa-expirada#verificacao');
  }
  const { secret, otpauthUri } = pending.data;
  let qr: { path: string; viewBox: number } | null = null;
  try {
    qr = qrSvgPath(encodeQr(otpauthUri));
  } catch {
    qr = null;
  }

  return (
    <SiteShell area="conta">
      <div className="lp-wrap lp-page lp-page-narrow">
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">Ativar app autenticador</h1>
          <p className="lp-lede">Depois de ativar, cada entrada pede também um código de 6 dígitos do app.</p>
        </header>
        <NoticeBar notice={noticeFrom(aviso)} />

        <ol className="lp-steps-list">
          <li className="lp-panel-card">
            <h2 className="lp-h-display">1. Adicione o Talentum ao app</h2>
            <p className="lp-muted">No app autenticador, escolha adicionar conta e aponte a câmera para o código abaixo.</p>
            {qr ? (
              <svg className="lp-qr" viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`} role="img" aria-label="Código QR para o app autenticador" shapeRendering="crispEdges">
                <rect width={qr.viewBox} height={qr.viewBox} fill="#fffdf8" />
                <path d={qr.path} fill="#1a110a" />
              </svg>
            ) : null}
            <p className="lp-muted lp-tiny">Sem câmera? Digite esta chave no app, no modo de chave manual, com o tipo baseado em tempo:</p>
            <p className="lp-secret">
              <code>{groupSecret(secret)}</code>
            </p>
          </li>
          <li className="lp-panel-card">
            <h2 className="lp-h-display">2. Confirme com o primeiro código</h2>
            <form method="post" action="/api/conta/mfa/ativar" className="lp-form">
              <label className="lp-field">
                <span>Código de 6 dígitos mostrado no app</span>
                <input name="code" className="lp-input lp-input-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} />
              </label>
              <SubmitButton pendingLabel="Ativando verificação">Ativar verificação</SubmitButton>
            </form>
            <p className="lp-muted lp-tiny">Esta etapa vale por 15 minutos. Depois disso, comece de novo em Minha conta.</p>
          </li>
        </ol>
        <p className="lp-page-aside">
          <a href="/conta">Voltar para Minha conta sem ativar</a>
        </p>
      </div>
    </SiteShell>
  );
}
