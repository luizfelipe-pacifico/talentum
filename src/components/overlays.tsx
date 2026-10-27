'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-state';
import { trapFocus } from '@/lib/focus-trap';
import { StateArt, type StateArtName } from '@/components/state-art';

/* Cada diálogo prende o foco enquanto está aberto e o devolve a quem o abriu. */
function useFocusTrap<T extends HTMLElement>() {
  const trapRef = useRef<T>(null);
  useEffect(() => (trapRef.current ? trapFocus(trapRef.current) : undefined), []);
  return trapRef;
}

export function Overlays() {
  const app = useApp();
  return <>
    {app.overlay === 'notif' && <NotificationsDrawer/>}
    {app.overlay === 'express' && <UnavailableDialog title="Lançamento manual" text="Cadastre uma conta e as categorias pelo backend antes de criar um lançamento."/>}
    {app.overlay === 'import' && <ImportDialog/>}
    {app.overlay === 'onboarding' && <OnboardingDialog/>}
    {app.overlay === 'conta' && <UnavailableDialog art="sem-contas" title="Contas" text="Nenhuma conta foi retornada pelo backend local."/>}
  </>;
}

function NotificationsDrawer() {
  const app = useApp();
  const trapRef = useFocusTrap<HTMLElement>();
  return <div className="drawer-wrap">
    <button type="button" className="overlay-scrim" aria-label="Fechar notificações" onClick={app.close}/>
    <aside ref={trapRef} className="drawer" role="dialog" aria-modal="true" aria-label="Notificações" tabIndex={-1}>
      <div className="drawer-head"><h2 className="h-display">Notificações</h2><button type="button" className="close-button" onClick={app.close} aria-label="Fechar"><i className="bi bi-x-lg"/></button></div>
      <div className="drawer-body"><StateArt name="sem-notificacoes"/><div className="callout callout-ok"><i className="bi bi-inbox"/><div><p className="callout-title">Nenhuma notificação</p><p className="small">Alertas aparecerão somente quando forem gerados a partir de dados persistidos.</p></div></div></div>
    </aside>
  </div>;
}

function UnavailableDialog({title,text,art}:{title:string;text:string;art?:StateArtName}) {
  const app=useApp();
  const trapRef=useFocusTrap<HTMLDivElement>();
  return <div className="overlay"><button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close}/><div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="dialog"><div className="row-between"><h2 className="dialog-title">{title}</h2><button type="button" className="close-button" onClick={app.close} aria-label="Fechar"><i className="bi bi-x-lg"/></button></div>{art&&<StateArt name={art} size="sm"/>}<p className="muted">{text}</p><button type="button" className="btn btn-neutral" onClick={app.close}>Fechar</button></div></div>;
}

function ImportDialog() {
  const app=useApp();
  const trapRef=useFocusTrap<HTMLDivElement>();
  const inputRef=useRef<HTMLInputElement>(null);
  const [fileName,setFileName]=useState<string>();
  return <div className="overlay">
    <button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close}/>
    <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Importar extrato" className="dialog dialog-md">
      <div className="row-between"><div><h2 className="dialog-title">Importar extrato</h2><p className="small muted">Selecione um CSV ou OFX para a inspeção local.</p></div><button type="button" className="close-button" onClick={app.close} aria-label="Fechar"><i className="bi bi-x-lg"/></button></div>
      <div className="dropzone">
        <StateArt name="importar-extrato" size="sm"/>
        <p><strong>{fileName ?? 'Nenhum arquivo selecionado'}</strong></p>
        <p className="small muted">A leitura do arquivo e a gravação dos lançamentos ainda não estão disponíveis nesta versão.</p>
        <input ref={inputRef} className="sr-only" type="file" accept=".csv,.ofx,text/csv,application/x-ofx" onChange={event=>setFileName(event.target.files?.[0]?.name)}/>
        <button type="button" className="btn btn-primary" onClick={()=>inputRef.current?.click()}>Escolher arquivo</button>
      </div>
      {fileName&&<div className="callout callout-info"><i className="bi bi-shield-lock"/><p className="small">O arquivo foi apenas selecionado no navegador. Nenhum dado foi importado ou enviado.</p></div>}
    </div>
  </div>;
}

function OnboardingDialog() {
  const app=useApp();
  const trapRef=useFocusTrap<HTMLDivElement>();
  return <div className="overlay"><button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close}/><div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Primeiro acesso" className="dialog dialog-lg"><h2 className="h-display-lg">Construa sua base financeira</h2><p className="muted">Nenhum valor é presumido. As etapas de contas, saldos e importação serão gravadas pelo backend local.</p><div className="callout callout-info"><i className="bi bi-hdd"/><p className="small">Seus dados financeiros permanecem no SQLite deste dispositivo.</p></div><div className="row-tight"><button type="button" className="btn btn-primary" onClick={app.openImport}>Selecionar primeiro extrato</button><button type="button" className="btn btn-neutral" onClick={app.close}>Fechar</button></div></div></div>;
}
