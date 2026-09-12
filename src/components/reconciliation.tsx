'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';

type Transaction = { id:string; occurredOn:string; description:string; amountCents:string; account:{id:string;name:string} };
type Row = { id:string; reason:string; confidence:number; createdAt:string; transaction:Transaction };
type Detail = { hasProfile:boolean; item:{ id:string; status:string; transaction:Transaction&{status:string;category:{id:string;name:string;kind:string}|null}; decisions:{id:string;kind:string;createdAt:string;revertedAt:string|null}[] }; categories:{id:string;name:string;kind:string}[] };
const money = (cents:string) => { const value=formatCents(cents); return `${value.symbol} ${value.value}`; };
function Loading(){return <section className="card" aria-busy="true"><p className="muted">Consultando a conciliação local…</p></section>}

export function ReconciliationQueue(){
  const [state,setState]=useState<{loading:boolean;error:boolean;items:Row[]}>({loading:true,error:false,items:[]});
  const load=useCallback(()=>{setState(s=>({...s,loading:true,error:false}));getJson<{hasProfile:boolean;items:Row[]}>('/api/reconciliation-items').then(r=>setState({loading:false,error:false,items:r.items??[]})).catch(()=>setState({loading:false,error:true,items:[]}))},[]);
  useEffect(load,[load]);
  if(state.loading)return <Loading/>;
  if(state.error)return <section className="card error-state" role="alert"><h2>Conciliação indisponível</h2><button className="btn btn-neutral" onClick={load}>Tentar novamente</button></section>;
  if(!state.items.length)return <section className="card empty"><i className="bi bi-check2-circle"/><h2 className="h-display">Tudo conciliado</h2><p className="muted">Não há lançamentos aguardando revisão.</p></section>;
  return <div className="stack-lg"><section className="card"><p className="eyebrow">Conciliação</p><h1 className="h-display">{state.items.length} {state.items.length===1?'item pendente':'itens pendentes'}</h1></section>{state.items.map(({id,transaction})=><Link key={id} href={`/conciliacao/${id}`} className="card"><div className="card-header"><div><strong>{transaction.description}</strong><p className="muted">{transaction.account.name} · {new Date(transaction.occurredOn).toLocaleDateString('pt-BR')}</p></div><strong>{money(transaction.amountCents)}</strong></div></Link>)}</div>;
}

export function ReconciliationDetail({itemId}:{itemId:string}){
  const [data,setData]=useState<Detail|null>(null),[error,setError]=useState(false),[busy,setBusy]=useState(false),[categoryId,setCategoryId]=useState(''),[amount,setAmount]=useState(''),[counterpart,setCounterpart]=useState('');
  const load=useCallback(()=>getJson<Detail>(`/api/reconciliation-items/${itemId}`).then(value=>{setData(value);setAmount(value.item.transaction.amountCents);setError(false)}).catch(()=>setError(true)),[itemId]);
  useEffect(()=>{void load()},[load]);
  const decide=async(body:unknown)=>{setBusy(true);try{await postJson(`/api/reconciliation-items/${itemId}/decisions`,body);await load()}catch{setError(true)}finally{setBusy(false)}};
  const revert=async(id:string)=>{setBusy(true);try{await postJson(`/api/reconciliation-decisions/${id}/revert`,{});await load()}catch{setError(true)}finally{setBusy(false)}};
  if(!data&&!error)return <Loading/>;
  if(!data)return <section className="card error-state"><h2>Item não encontrado</h2><Link href="/conciliacao" className="btn btn-neutral">Voltar</Link></section>;
  const t=data.item.transaction, transferCategory=data.categories.find(c=>c.kind==='transfer');
  return <div className="stack-lg"><Link href="/conciliacao" className="btn btn-ghost">← Voltar para a fila</Link>{error&&<p role="alert" className="muted">A operação não pôde ser concluída.</p>}<section className="card card-lg"><p className="eyebrow">{t.account.name}</p><h1 className="h-display">{t.description}</h1><p>{new Date(t.occurredOn).toLocaleDateString('pt-BR')} · <strong>{money(t.amountCents)}</strong></p><p className="muted">Status: {data.item.status==='pending'?'aguardando decisão':'resolvido'}</p></section>{data.item.status==='pending'&&<section className="card stack"><h2>Tomar decisão</h2><button disabled={busy} className="btn btn-neutral" onClick={()=>decide({kind:'confirm'})}>Confirmar como está</button><label className="field">Categoria<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Selecione</option>{data.categories.filter(c=>c.kind!=='transfer').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button disabled={busy||!categoryId} className="btn btn-primary" onClick={()=>decide({kind:'category',categoryId})}>Aplicar categoria</button><label className="field">Valor corrigido em centavos<input value={amount} inputMode="numeric" onChange={e=>setAmount(e.target.value)}/></label><button disabled={busy||!/^[-]?\d+$/.test(amount)} className="btn btn-neutral" onClick={()=>decide({kind:'adjustment',adjustedAmountCents:amount,adjustmentKind:'correction'})}>Registrar ajuste</button>{transferCategory&&<><label className="field">ID do lançamento correspondente<input value={counterpart} onChange={e=>setCounterpart(e.target.value)} /></label><button disabled={busy||!counterpart} className="btn btn-neutral" onClick={()=>decide({kind:'transfer',counterpartTransactionId:counterpart,categoryId:transferCategory.id})}>Vincular transferência entre contas</button></>}</section>}{!!data.item.decisions.length&&<section className="card"><h2>Histórico</h2>{data.item.decisions.map(d=><div key={d.id} className="card-header"><span>{d.kind} · {new Date(d.createdAt).toLocaleString('pt-BR')}</span>{!d.revertedAt&&<button disabled={busy} className="btn btn-sm btn-neutral" onClick={()=>revert(d.id)}>Reverter</button>}</div>)}</section>}</div>;
}
