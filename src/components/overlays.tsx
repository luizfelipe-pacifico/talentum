'use client';

import Link from 'next/link';
import { useApp } from '@/components/app-state';

export function Overlays() {
  const app = useApp();
  return <>
    {app.overlay === 'notif' && <NotificationsDrawer/>}
    {app.overlay === 'express' && <UnavailableDialog title="Lançamento manual" text="Cadastre uma conta e as categorias pelo backend antes de criar um lançamento."/>}
    {app.overlay === 'import' && <ImportDialog/>}
    {app.overlay === 'onboarding' && <OnboardingDialog/>}
    {app.overlay === 'conta' && <UnavailableDialog title="Contas" text="Nenhuma conta foi retornada pelo backend local."/>}
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
