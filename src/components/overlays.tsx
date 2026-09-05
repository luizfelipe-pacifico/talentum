'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-state';
import { CONTAS, IMPORT_LABELS } from '@/lib/demo-data';

export function Overlays() {
  const app = useApp();

  return (
    <>
      {app.overlay === 'notif' && <NotificationsDrawer />}
      {app.overlay === 'express' && <ExpressDialog />}
      {app.overlay === 'import' && <ImportDialog />}
      {app.overlay === 'onboarding' && <OnboardingDialog />}
      {app.overlay === 'conta' && <AccountPopover />}
    </>
  );
}

function NotificationsDrawer() {
  const app = useApp();
  const router = useRouter();

  const goto = (href: string) => () => {
    app.close();
    router.push(href);
  };

  return (
    <div className="drawer-wrap">
      <button type="button" className="overlay-scrim" aria-label="Fechar notificações" onClick={app.close} />
      <aside className="drawer">
        <div className="drawer-head">
          <h2 className="h-display">Notificações</h2>
          <button type="button" className="close-button" onClick={app.close} aria-label="Fechar">
            <i className="bi bi-x-lg" style={{ fontSize: 13 }} />
          </button>
        </div>
        <div className="drawer-body">
          <p className="callout-title" style={{ margin: '18px 0 8px', color: 'var(--err)' }}>
            Exige ação hoje
          </p>
          <div className="callout callout-err" style={{ marginBottom: 10 }}>
            <div>
              <p className="small">Sua fatura de R$ 1.200,00 vence hoje. Confira se o débito ocorreu corretamente.</p>
              <button type="button" className="btn-link" onClick={goto('/conciliacao/faturas')}>
                Conferir fatura
              </button>
            </div>
          </div>
          <div className="callout callout-err">
            <div>
              <p className="small">A conta de internet venceu em 03/09 e ainda não foi conciliada.</p>
              <button type="button" className="btn-link" onClick={goto('/extratos/recorrencias')}>
                Ver recorrências
              </button>
            </div>
          </div>

          <p className="callout-title" style={{ margin: '22px 0 8px', color: 'var(--warn)' }}>
            Esta semana
          </p>
          <div className="callout" style={{ marginBottom: 10 }}>
            <div>
              <p className="small">O extrato desta semana ainda não foi importado.</p>
              <button type="button" className="btn-link" onClick={app.openImport}>
                Importar agora
              </button>
            </div>
          </div>
          <div className="callout" style={{ marginBottom: 10 }}>
            <div>
              <p className="small">O pilar de Ativos Internacionais está abaixo da faixa de equilíbrio.</p>
              <button type="button" className="btn-link" onClick={goto('/patrimonio')}>
                Ver carteira
              </button>
            </div>
          </div>
          <div className="callout">
            <p className="small">4.200 pontos do cartão Vega Livre expiram em 21 dias.</p>
          </div>

          <p className="callout-title" style={{ margin: '22px 0 8px', color: 'var(--ink2)' }}>
            Informativo
          </p>
          <div className="callout" style={{ marginBottom: 10 }}>
            <p className="small">Hoje é o dia previsto para o pagamento de proventos de XPML11.</p>
          </div>
          <div className="callout">
            <div>
              <p className="small">Sobraram R$ 400,00 no orçamento. Deseja direcionar esse valor?</p>
              <button type="button" className="btn-link" onClick={goto('/patrimonio')}>
                Destinar superávit
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ExpressDialog() {
  const app = useApp();

  return (
    <div className="overlay">
      <button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close} />
      <div role="dialog" aria-modal="true" aria-label="Lançamento express de dinheiro" className="dialog">
        <h2 className="dialog-title">Lançar dinheiro</h2>
        <p className="small muted" style={{ margin: '0 0 22px' }}>
          Três campos, nada mais. Para despesa em espécie, registrada na hora.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label className="field field-amount">
            Valor
            <input type="text" inputMode="decimal" placeholder="R$ 0,00" />
          </label>
          <label className="field field-sunken">
            Categoria
            <select defaultValue="Alimentação">
              <option>Alimentação</option>
              <option>Transporte</option>
              <option>Moradia</option>
              <option>Saúde</option>
              <option>Lazer</option>
              <option>Outros</option>
            </select>
          </label>
          <label className="field field-sunken">
            Nota rápida
            <input type="text" placeholder="Café" />
          </label>
        </div>
        <div className="row-tight" style={{ marginTop: 24 }}>
          <button type="button" className="btn btn-primary" onClick={app.close}>
            Lançar
          </button>
          <button type="button" className="btn btn-neutral" onClick={app.close}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportDialog() {
  const app = useApp();
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const advance = () => {
    if (app.importStep === 1) {
      app.setImportStep(2);
      timer.current = setTimeout(() => app.setImportStep(3), 1600);
      return;
    }
    app.setImportStep(Math.min(3, app.importStep + 1));
  };

  const finish = () => {
    app.close();
    app.setImportStep(1);
    router.push('/conciliacao');
  };

  return (
    <div className="overlay">
      <button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close} />
      <div role="dialog" aria-modal="true" aria-label="Importar extrato" className="dialog dialog-md">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <h2 className="dialog-title">Importar extrato</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Etapa {app.importStep} de 3 · {IMPORT_LABELS[app.importStep - 1]}
            </p>
          </div>
          <button type="button" className="close-button" onClick={app.close} aria-label="Fechar">
            <i className="bi bi-x-lg" style={{ fontSize: 13 }} />
          </button>
        </div>

        <div className="step-track">
          {[1, 2, 3].map((step) => (
            <div key={step} className={step <= app.importStep ? 'done' : undefined} />
          ))}
        </div>

        {app.importStep === 1 && (
          <div>
            <div className={`dropzone${dragging ? ' dragging' : ''}`}>
              <i className="bi bi-filetype-pdf" style={{ fontSize: 26, color: 'var(--ink2)' }} aria-hidden="true" />
              <p style={{ margin: '12px 0 4px', fontSize: 16, fontWeight: 600 }}>Arraste o extrato para cá</p>
              <p className="small muted" style={{ margin: '0 0 18px' }}>
                PDF ou OFX, até 20 MB por arquivo. O processamento é feito no seu computador.
              </p>
              <div className="row-tight" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-primary" onClick={advance}>
                  Escolher arquivo
                </button>
                <button
                  type="button"
                  className="btn btn-neutral"
                  onClick={() => setDragging((current) => !current)}
                >
                  {dragging ? 'Sair do estado arrastando' : 'Ver estado arrastando'}
                </button>
              </div>
            </div>
            <div className="callout" style={{ marginTop: 18 }}>
              <i className="bi bi-slash-circle" style={{ fontSize: 15, color: 'var(--ink2)', marginTop: 2 }} />
              <p className="small muted">
                Conexão automática com o banco por Open Finance está prevista e ainda não disponível.
              </p>
            </div>
          </div>
        )}

        {app.importStep === 2 && (
          <div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 20 }}>
              <div className="row-between" style={{ marginBottom: 14 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>extrato-agosto.ofx</p>
                <p className="small muted num" style={{ margin: 0 }}>
                  1,2 MB
                </p>
              </div>
              <div className="bar" style={{ marginBottom: 12 }}>
                <div className="bar-fill" style={{ width: '72%' }} />
              </div>
              <p className="small muted num" style={{ margin: 0 }}>
                42 transações lidas · 38 categorizadas automaticamente · 4 com baixa confiança
              </p>
            </div>
            <div className="row-tight" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-primary" onClick={advance}>
                Ver resultado
              </button>
              <button type="button" className="btn btn-neutral" onClick={app.close}>
                Cancelar importação
              </button>
            </div>
          </div>
        )}

        {app.importStep === 3 && (
          <div>
            <div className="callout callout-ok" style={{ marginBottom: 16, display: 'block', padding: 18 }}>
              <p className="callout-title" style={{ color: 'var(--ok)' }}>
                <i className="bi bi-check-circle" />
                Importação concluída
              </p>
              <p style={{ margin: 0, fontSize: 14, lineHeight: '21px' }}>
                42 transações adicionadas ao lote #129. Quatro lançamentos ficaram com classificação incerta e
                aguardam sua confirmação.
              </p>
            </div>
            <table className="tbl" style={{ marginBottom: 20 }}>
              <tbody>
                <tr>
                  <th scope="row" className="muted">
                    Transações lidas
                  </th>
                  <td>42</td>
                </tr>
                <tr>
                  <th scope="row" className="muted">
                    Categorizadas automaticamente
                  </th>
                  <td>38</td>
                </tr>
                <tr>
                  <th scope="row" className="muted">
                    Enviadas à triagem
                  </th>
                  <td>4</td>
                </tr>
                <tr>
                  <th scope="row" className="muted">
                    Duplicadas ignoradas
                  </th>
                  <td>0</td>
                </tr>
              </tbody>
            </table>
            <div className="callout callout-warn" style={{ marginBottom: 20, display: 'block', padding: 16 }}>
              <p className="callout-title" style={{ color: 'var(--warn)' }}>
                <i className="bi bi-files" />
                Aviso · arquivo já importado
              </p>
              <p className="small" style={{ margin: 0 }}>
                Se o mesmo arquivo for enviado de novo, a importação é bloqueada pela impressão digital do
                documento. Não é falha: é proteção contra lançamentos duplicados.
              </p>
            </div>
            <div className="row-tight">
              <button type="button" className="btn btn-primary" onClick={finish}>
                Ir para a triagem
              </button>
              <button type="button" className="btn btn-neutral" onClick={app.close}>
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OnboardingDialog() {
  const app = useApp();

  return (
    <div className="overlay" style={{ zIndex: 60 }}>
      <button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close} />
      <div role="dialog" aria-modal="true" aria-label="Primeiro acesso" className="dialog dialog-lg">
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Primeiro acesso
        </p>
        <h2
          className="h-display-lg"
          style={{ fontSize: 'clamp(28px, 3vw, 36px)', lineHeight: 1.2, margin: '0 0 8px' }}
        >
          Clareza para o presente. Disciplina para o futuro.
        </h2>
        <p className="muted" style={{ margin: '0 0 26px', fontSize: 15, lineHeight: '23px', maxWidth: '66ch' }}>
          Três coisas antes de começar. Leva menos de um minuto.
        </p>
        <div className="grid grid-230" style={{ gap: 18 }}>
          {[
            {
              icon: 'bi-file-earmark-arrow-up',
              title: 'Leitor automatizado',
              text: 'Importe um extrato em PDF ou OFX. As transações entram categorizadas, sem digitação.',
            },
            {
              icon: 'bi-flag',
              title: 'Metas',
              text: 'Crie uma reserva, uma viagem ou outra compra planejada e veja quanto guardar por mês.',
            },
            {
              icon: 'bi-columns-gap',
              title: 'Patrimônio',
              text: 'Acompanhe a carteira nos quatro pilares e veja onde o próximo aporte faz mais diferença.',
            },
          ].map((card) => (
            <div key={card.title} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 20 }}>
              <i className={`bi ${card.icon}`} style={{ fontSize: 20, color: 'var(--amber)' }} aria-hidden="true" />
              <p style={{ margin: '12px 0 4px', fontSize: 16, fontWeight: 600 }}>{card.title}</p>
              <p className="small muted" style={{ margin: 0, lineHeight: '20px' }}>
                {card.text}
              </p>
            </div>
          ))}
        </div>
        <div className="callout callout-info" style={{ marginTop: 20, padding: 16 }}>
          <i className="bi bi-hdd" style={{ fontSize: 16, color: 'var(--info)', marginTop: 2 }} aria-hidden="true" />
          <p className="small" style={{ lineHeight: '20px' }}>
            Seus valores ficam no seu computador, em um banco local. A nuvem cuida apenas da sua conta e do
            download do aplicativo — ela não conhece suas transações.
          </p>
        </div>
        <div style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 22 }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Como quer começar?</p>
          <div className="row-tight">
            <button type="button" className="btn btn-primary" onClick={app.openImport}>
              Importar meu primeiro extrato
            </button>
            <button type="button" className="btn btn-neutral" onClick={app.close}>
              Informar meu patrimônio atual
            </button>
            <button type="button" className="btn btn-neutral" onClick={app.close}>
              Começar do zero, com R$ 0,00
            </button>
          </div>
          <p className="tiny muted" style={{ margin: '12px 0 0' }}>
            Começar do zero não é caminho de exceção: você pode registrar Tesouro, CDB, ações, FIIs e ativos
            internacionais depois, quando quiser.
          </p>
        </div>
      </div>
    </div>
  );
}

function AccountPopover() {
  const app = useApp();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 45 }}>
      <button
        type="button"
        className="overlay-scrim"
        style={{ background: 'rgb(26 17 10 / 30%)' }}
        aria-label="Fechar seletor de conta"
        onClick={app.close}
      />
      <div role="dialog" aria-modal="true" aria-label="Conta ativa" className="account-popover">
        <p className="callout-title" style={{ color: 'var(--ink2)', marginBottom: 10 }}>
          Escopo dos dados exibidos
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {CONTAS.map((conta, index) => (
            <button
              key={conta.label}
              type="button"
              className="account-option"
              aria-pressed={app.contaIndex === index}
              onClick={() => {
                app.setContaIndex(index);
                app.close();
              }}
            >
              <span>{conta.label}</span>
              <span className="small muted num">{conta.saldo}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
