'use client';

import Link from 'next/link';
import { useApp } from '@/components/app-state';
import { AccountBalance } from '@/components/accounts';
import { useAccounts } from '@/hooks/use-accounts';

export function Overlays() {
  const app = useApp();
  return <>
    {app.overlay === 'notif' && <NotificationsDrawer/>}
    {app.overlay === 'express' && <UnavailableDialog title="Lançamento manual" text="Cadastre uma conta e as categorias pelo backend antes de criar um lançamento."/>}
    {app.overlay === 'import' && <ImportDialog/>}
    {app.overlay === 'onboarding' && <OnboardingDialog/>}
    {app.overlay === 'conta' && <AccountsDialog/>}
  </>;
}

function NotificationsDrawer() {
  const app = useApp();
  return <div className="drawer-wrap">
    <button type="button" className="overlay-scrim" aria-label="Fechar notificações" onClick={app.close}/>
    <aside className="drawer">
      <div className="drawer-head"><h2 className="h-display">Notificações</h2><button type="button" className="close-button" onClick={app.close} aria-label="Fechar"><i className="bi bi-x-lg"/></button></div>
      <div className="drawer-body"><div className="callout callout-ok"><i className="bi bi-inbox"/><div><p className="callout-title">Nenhuma notificação</p><p className="small">Alertas aparecerão somente quando forem gerados a partir de dados persistidos.</p></div></div></div>
    </aside>
  </div>;
}

/* Seletor de contas.

   Critério de conclusão da Feature 2 em docs/ROUTING_MVP.md: criar, editar ou
   desativar uma conta atualiza este seletor e o saldo consolidado por consulta
   ao backend. Só contas ativas aparecem, porque são elas que compõem o total. */
function AccountsDialog() {
  const app = useApp();
  const state = useAccounts();

  const body = () => {
    if (state.status === 'loading') {
      return <span className="skeleton skeleton-line" />;
    }
    if (state.status === 'error') {
      return (
        <div className="callout callout-warn" role="alert">
          <i className="bi bi-exclamation-triangle"/>
          <p className="small">Não foi possível consultar as contas. Nenhum saldo é exibido sem resposta do backend.</p>
        </div>
      );
    }
    if (!state.payload.hasProfile || state.payload.accounts.length === 0) {
      return <p className="muted">Nenhuma conta cadastrada ainda.</p>;
    }

    const active = state.payload.accounts.filter((account) => account.isActive);
    if (active.length === 0) return <p className="muted">Todas as contas estão desativadas.</p>;

    return (
      <table className="tbl tbl-data">
        <caption className="sr-only">Contas ativas e o saldo conhecido de cada uma.</caption>
        <tbody>
          {active.map((account) => (
            <tr key={account.id}>
              <td>
                <Link href={`/contas/${account.id}`} onClick={app.close}>{account.name}</Link>
                {account.institution && <span className="small muted"> · {account.institution.name}</span>}
              </td>
              <td className="right"><AccountBalance account={account}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return <div className="overlay">
    <button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close}/>
    <div role="dialog" aria-modal="true" aria-label="Contas" className="dialog dialog-md">
      <div className="row-between"><div><h2 className="dialog-title">Contas</h2><p className="small muted">Saldos conhecidos, consultados no banco local.</p></div><button type="button" className="close-button" onClick={app.close} aria-label="Fechar"><i className="bi bi-x-lg"/></button></div>
      {body()}
      <div className="row-tight">
        <Link className="btn btn-primary" href="/contas" onClick={app.close}>Gerenciar contas</Link>
        <Link className="btn btn-neutral" href="/contas/nova" onClick={app.close}>Cadastrar conta</Link>
      </div>
    </div>
  </div>;
}

function UnavailableDialog({title,text}:{title:string;text:string}) {
  const app=useApp();
  return <div className="overlay"><button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close}/><div role="dialog" aria-modal="true" aria-label={title} className="dialog"><div className="row-between"><h2 className="dialog-title">{title}</h2><button type="button" className="close-button" onClick={app.close} aria-label="Fechar"><i className="bi bi-x-lg"/></button></div><p className="muted">{text}</p><button type="button" className="btn btn-neutral" onClick={app.close}>Fechar</button></div></div>;
}

/* A importação real mora em /extratos/importar: ela tem prévia, mapeamento de
   colunas, escolha de conta e confirmação, que não cabem em um diálogo. O
   atalho global apenas leva até lá. */
function ImportDialog() {
  const app=useApp();
  return <div className="overlay">
    <button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close}/>
    <div role="dialog" aria-modal="true" aria-label="Importar extrato" className="dialog dialog-md">
      <div className="row-between"><div><h2 className="dialog-title">Importar extrato</h2><p className="small muted">CSV ou OFX, processado no seu dispositivo.</p></div><button type="button" className="close-button" onClick={app.close} aria-label="Fechar"><i className="bi bi-x-lg"/></button></div>
      <p className="muted">O assistente mostra a leitura do arquivo antes de gravar qualquer coisa: período coberto, lançamentos reconhecidos e linhas com problema.</p>
      <div className="callout callout-info"><i className="bi bi-shield-lock"/><p className="small">O extrato é lido pelo backend local e não é enviado à nuvem. O conteúdo do arquivo não é armazenado.</p></div>
      <div className="row-tight">
        <Link className="btn btn-primary" href="/extratos/importar" onClick={app.close}>Abrir o assistente</Link>
        <button type="button" className="btn btn-neutral" onClick={app.close}>Fechar</button>
      </div>
    </div>
  </div>;
}

function OnboardingDialog() {
  const app=useApp();
  return <div className="overlay"><button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close}/><div role="dialog" aria-modal="true" aria-label="Primeiro acesso" className="dialog dialog-lg"><p className="eyebrow">Primeiro acesso</p><h2 className="h-display-lg">Construa sua base financeira</h2><p className="muted">Nenhum valor é presumido. As etapas de contas, saldos e importação serão gravadas pelo backend local.</p><div className="callout callout-info"><i className="bi bi-hdd"/><p className="small">Seus dados financeiros permanecem no SQLite deste dispositivo.</p></div><div className="row-tight"><button type="button" className="btn btn-primary" onClick={app.openImport}>Selecionar primeiro extrato</button><button type="button" className="btn btn-neutral" onClick={app.close}>Fechar</button></div></div></div>;
}
