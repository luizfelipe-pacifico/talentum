import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SubmitButton } from '../../components/lp/form-helpers';
import { Icon } from '../../components/lp/icon';
import { NoticeBar, SiteShell } from '../../components/lp/site-shell';
import { readWorker } from '../../server/community-bff';
import { formatLongDate, LIMITS, noticeFrom, plural } from '../../server/community-forms';
import type { Me, MfaStatus, Session } from '../../server/community-types';

export const metadata: Metadata = { title: 'Minha conta · Talentum', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ aviso?: string | string[] }> }) {
  const { aviso } = await searchParams;
  const me = await readWorker<Me>('/api/me');
  if (!me.ok) {
    if (me.status === 401) redirect('/entrar?retorno=%2Fconta&erro=sessao');
    return <Unavailable />;
  }
  const [sessions, mfa] = await Promise.all([readWorker<{ sessions: Session[] }>('/api/me/sessions'), readWorker<MfaStatus>('/api/me/mfa')]);
  const user = me.data.user;

  return (
    <SiteShell area="conta">
      <div className="lp-wrap lp-page lp-page-narrow">
        <header className="lp-page-head">
          <h1 className="lp-h-display-lg">Minha conta</h1>
          <p className="lp-muted">Na comunidade desde {formatLongDate(user.memberSince)}.</p>
        </header>
        <NoticeBar notice={noticeFrom(aviso)} />

        <section className="lp-panel-card" aria-labelledby="nome-publico">
          <h2 className="lp-h-display" id="nome-publico">
            Nome público
          </h2>
          <p className="lp-muted">Aparece nas suas sugestões e comentários. Seu e-mail nunca é exibido.</p>
          <form method="post" action="/api/conta/nome" className="lp-form lp-form-inline">
            <label className="lp-field">
              <span>Nome exibido na comunidade</span>
              <input
                name="nome"
                className="lp-input"
                defaultValue={user.publicName}
                required
                minLength={LIMITS.publicName.min}
                maxLength={LIMITS.publicName.max}
                autoComplete="nickname"
              />
            </label>
            <SubmitButton className="lp-btn" pendingLabel="Salvando nome">
              Salvar nome
            </SubmitButton>
          </form>
        </section>

        <section className="lp-panel-card" id="verificacao" aria-labelledby="verificacao-titulo">
          <h2 className="lp-h-display" id="verificacao-titulo">
            Verificação em duas etapas
          </h2>
          {mfa.ok ? <MfaSection status={mfa.data} /> : <p className="lp-muted">Não foi possível consultar a verificação agora. Recarregue a página.</p>}
        </section>

        <section className="lp-panel-card" id="sessoes" aria-labelledby="sessoes-titulo">
          <h2 className="lp-h-display" id="sessoes-titulo">
            Sessões abertas
          </h2>
          {sessions.ok ? (
            <ul className="lp-session-list">
              {sessions.data.sessions.map((session) => (
                <li key={session.id}>
                  <div>
                    <strong>{session.current ? 'Este navegador' : 'Outro navegador'}</strong>
                    <span className="lp-muted lp-tiny">
                      Entrada em {formatLongDate(session.createdAt)}
                      {session.lastSeenAt ? ` · último uso em ${formatLongDate(session.lastSeenAt)}` : ''}
                    </span>
                  </div>
                  {session.current ? (
                    <span className="lp-chip">Sessão atual</span>
                  ) : (
                    <form method="post" action={`/api/conta/sessoes/${encodeURIComponent(session.id)}/encerrar`}>
                      <SubmitButton className="lp-btn lp-btn-sm" pendingLabel="Encerrando sessão">
                        Encerrar sessão
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="lp-muted">Não foi possível listar as sessões agora. Recarregue a página.</p>
          )}
          <form method="post" action="/api/auth/logout" className="lp-form-end">
            <button type="submit" className="lp-btn">
              <Icon name="bi-box-arrow-right" />
              Sair deste navegador
            </button>
          </form>
        </section>

        <section className="lp-panel-card lp-danger-zone" id="excluir" aria-labelledby="excluir-titulo">
          <h2 className="lp-h-display" id="excluir-titulo">
            Excluir conta
          </h2>
          <p>A exclusão não pode ser desfeita. Ao excluir:</p>
          <ul className="lp-plain-list lp-plain-list-tight">
            <li>todas as sessões são encerradas, inclusive neste navegador;</li>
            <li>e-mail, perfil, aceites, liberações de download e votos são apagados;</li>
            <li>o texto das suas sugestões e comentários é apagado e aparece como conteúdo removido;</li>
            <li>os dados financeiros no seu computador continuam intactos.</li>
          </ul>
          <details className="lp-disclosure">
            <summary>Quero excluir minha conta</summary>
            <form method="post" action="/api/conta/excluir" className="lp-form">
              <label className="lp-field">
                <span>
                  Digite <strong>EXCLUIR</strong> para confirmar
                </span>
                <input name="confirmacao" className="lp-input" required pattern="EXCLUIR" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
              </label>
              <SubmitButton className="lp-btn lp-btn-danger" pendingLabel="Excluindo conta">
                Excluir conta definitivamente
              </SubmitButton>
            </form>
          </details>
        </section>
      </div>
    </SiteShell>
  );
}

function MfaSection({ status }: { status: MfaStatus }) {
  if (status.totp !== 'ACTIVE') {
    return (
      <>
        <p className="lp-muted">
          Além da conta Google, cada entrada pede um código de 6 dígitos de um app autenticador, como Google Authenticator,
          Microsoft Authenticator ou 2FAS.
        </p>
        <form method="post" action="/api/conta/mfa/iniciar">
          <SubmitButton className="lp-btn lp-btn-primary" pendingLabel="Preparando app autenticador">
            Ativar app autenticador
          </SubmitButton>
        </form>
      </>
    );
  }
  return (
    <>
      <p>
        <span className="lp-chip lp-chip-ok">
          <Icon name="bi-shield-lock" />
          Ativa
        </span>{' '}
        <span className="lp-muted">{plural(status.recoveryCodesRemaining, 'código de recuperação restante', 'códigos de recuperação restantes')}.</span>
      </p>
      {status.recoveryCodesToReveal ? (
        <p>
          <a href="/conta/mfa/codigos">Ver os códigos de recuperação ainda não exibidos</a>
        </p>
      ) : null}
      <details className="lp-disclosure">
        <summary>Gerar novos códigos de recuperação</summary>
        <form method="post" action="/api/conta/mfa/codigos" className="lp-form">
          <p className="lp-muted lp-tiny">Os códigos atuais deixam de valer. Confirme com o código que o app mostra agora.</p>
          <CodeField />
          <SubmitButton className="lp-btn" pendingLabel="Gerando códigos">
            Gerar novos códigos
          </SubmitButton>
        </form>
      </details>
      <details className="lp-disclosure">
        <summary>Desativar verificação em duas etapas</summary>
        <form method="post" action="/api/conta/mfa/desativar" className="lp-form">
          <p className="lp-muted lp-tiny">A entrada volta a pedir só a conta Google. Confirme com o código do app ou um código de recuperação.</p>
          <label className="lp-field">
            <span>Código do app ou de recuperação</span>
            <input name="code" className="lp-input lp-input-code" required autoComplete="one-time-code" maxLength={9} spellCheck={false} />
          </label>
          <SubmitButton className="lp-btn lp-btn-danger" pendingLabel="Desativando verificação">
            Desativar verificação
          </SubmitButton>
        </form>
      </details>
    </>
  );
}

function CodeField() {
  return (
    <label className="lp-field">
      <span>Código do app</span>
      <input name="code" className="lp-input lp-input-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} />
    </label>
  );
}

function Unavailable() {
  return (
    <SiteShell area="conta">
      <section className="lp-wrap lp-page lp-page-narrow">
        <h1 className="lp-h-display-lg">Minha conta</h1>
        <p className="lp-lede">O serviço da conta não respondeu. Nada foi alterado. Recarregue a página em alguns minutos.</p>
      </section>
    </SiteShell>
  );
}
