'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, getJson, postJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';

type Transaction = { id:string; occurredOn:string; description:string; amountCents:string; account:{id:string;name:string} };
type Candidate = Transaction & { confidence:number|null; ownPix:boolean };
type Row = { id:string; reason:string; confidence:number; createdAt:string; transaction:Transaction };
type Obligation = { id:string; description:string; amountCents:string; dueDate:string };
type Category = { id:string; name:string; kind:string };
type Suggestion = { category:Category; confidence:number; rule:{ pattern:string; matchType:'contains'|'startsWith'|'exact' } };
type Detail = { hasProfile:boolean; item:{ id:string; status:string; reason:string; confidence:number; transaction:Transaction&{status:string;category:Category|null}; decisions:{id:string;kind:string;createdAt:string;revertedAt:string|null}[] }; categories:Category[]; obligations:Obligation[]; transferCandidates:Candidate[]; suggestion:Suggestion|null; proposedPattern:string };
const money = (cents:string) => { const value=formatCents(cents); return `${value.symbol} ${value.value}`; };
const day = (iso:string) => new Date(iso).toLocaleDateString('pt-BR', { day:'numeric', month:'long', year:'numeric' });

/* Motivo de cada item na fila, nas palavras da pessoa (docs/DESIGN-SYSTEM.md, UX writing). */
const REASONS:Record<string,string> = {
  category_unknown:'Sem categoria',
  merchant_rule_suggestion:'Categoria sugerida por regra',
  merchant_rule_conflict:'Duas regras indicam categorias diferentes',
  own_transfer_candidate:'Possível transferência entre suas contas',
  rule_reverted:'Regra desfeita: escolha a categoria',
  merchant_rule:'Categoria aplicada por regra',
};
const DECISIONS:Record<string,string> = {
  confirm:'Confirmado como está', category:'Categoria aplicada', obligation:'Compromisso marcado como pago',
  adjustment:'Valor ajustado', transfer:'Transferência entre contas pareada', rule:'Categoria aplicada por regra',
};
const MATCH:Record<Suggestion['rule']['matchType'],string> = { exact:'é igual a', startsWith:'começa com', contains:'contém' };

function Loading(){return <section className="card" aria-busy="true"><p className="muted">Consultando a conciliação local…</p></section>}

export function ReconciliationQueue(){
  const [state,setState]=useState<{loading:boolean;error:boolean;items:Row[]}>({loading:true,error:false,items:[]});
  const load=useCallback(()=>{setState(s=>({...s,loading:true,error:false}));getJson<{hasProfile:boolean;items:Row[]}>('/api/reconciliation-items').then(r=>setState({loading:false,error:false,items:r.items??[]})).catch(()=>setState({loading:false,error:true,items:[]}))},[]);
  useEffect(load,[load]);
  if(state.loading)return <Loading/>;
  if(state.error)return <section className="card error-state" role="alert"><h2>Conciliação indisponível</h2><button type="button" className="btn btn-neutral" onClick={load}>Tentar novamente</button></section>;
  if(!state.items.length)return <section className="card empty"><i className="bi bi-check2-circle"/><h2 className="h-display">Tudo conciliado</h2><p className="muted">Não há lançamentos aguardando revisão.</p></section>;
  return <div className="stack-lg"><section className="card"><p className="eyebrow">Conciliação</p><h1 className="h-display">{state.items.length} {state.items.length===1?'item pendente':'itens pendentes'}</h1></section>{state.items.map(({id,reason,transaction})=><Link key={id} href={`/conciliacao/${id}`} className="card"><div className="card-header"><div><strong>{transaction.description}</strong><p className="muted">{transaction.account.name} · {day(transaction.occurredOn)}</p><p className="small"><span className="chip">{REASONS[reason]??'Aguarda revisão'}</span></p></div><strong>{money(transaction.amountCents)}</strong></div></Link>)}</div>;
}

export function ReconciliationDetail({itemId}:{itemId:string}){
  const [data,setData]=useState<Detail|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[categoryId,setCategoryId]=useState(''),[amount,setAmount]=useState(''),[counterpart,setCounterpart]=useState(''),[obligationId,setObligationId]=useState(''),[makeRule,setMakeRule]=useState(false),[pattern,setPattern]=useState('');
  const load=useCallback(()=>getJson<Detail>(`/api/reconciliation-items/${itemId}`).then(value=>{setData(value);setAmount(value.item.transaction.amountCents);setPattern(value.proposedPattern);setCounterpart(current=>current||(value.transferCandidates[0]?.confidence!=null?value.transferCandidates[0].id:''));setError('')}).catch(()=>setError('Não foi possível consultar este item. Tente novamente.')),[itemId]);
  useEffect(()=>{void load()},[load]);
  const failure=(cause:unknown)=>setError(cause instanceof ApiError&&cause.publicMessage?cause.publicMessage:'A decisão não pôde ser aplicada. Nada foi alterado.');
  const decide=async(body:unknown)=>{setBusy(true);setNotice('');try{await postJson(`/api/reconciliation-items/${itemId}/decisions`,body);await load()}catch(cause){failure(cause)}finally{setBusy(false)}};
  /* Categoria escolhida com "aplicar também a lançamentos parecidos": a decisão
     vem primeiro; a regra e a reaplicação são conveniência e não desfazem a
     decisão se falharem (padrão "filtrar mensagens como esta" dos apps de e-mail). */
  const decideCategory=async(id:string)=>{setBusy(true);setNotice('');try{await postJson(`/api/reconciliation-items/${itemId}/decisions`,{kind:'category',categoryId:id});if(makeRule&&pattern.trim().length>=2){try{await postJson('/api/merchant-rules',{categoryId:id,pattern:pattern.trim(),matchType:'startsWith'});}catch(cause){if(!(cause instanceof ApiError&&cause.code==='MERCHANT_RULE_EXISTS'))throw cause}const applied=await postJson<{applied:number;suggested:number}>('/api/merchant-rules/apply',{});setNotice(applied.applied>0?`Regra criada. ${applied.applied} ${applied.applied===1?'outro lançamento pendente recebeu':'outros lançamentos pendentes receberam'} a mesma categoria.`:'Regra criada. Ela vale para as próximas importações.')}await load()}catch(cause){failure(cause)}finally{setBusy(false)}};
  const revert=async(id:string)=>{setBusy(true);setNotice('');try{await postJson(`/api/reconciliation-decisions/${id}/revert`,{});await load()}catch(cause){failure(cause)}finally{setBusy(false)}};
  if(!data&&!error)return <Loading/>;
  if(!data)return <section className="card error-state" role="alert"><h2>Item indisponível</h2><p className="muted">{error}</p><div className="row-tight"><button type="button" className="btn btn-neutral" onClick={()=>{setError('');void load()}}>Tentar novamente</button><Link href="/conciliacao" className="btn btn-quiet">Voltar para a fila</Link></div></section>;
  const t=data.item.transaction, transferCategory=data.categories.find(c=>c.kind==='transfer'), suggestion=data.suggestion, best=data.transferCandidates[0];
  const pending=data.item.status==='pending';
  return <div className="stack-lg"><Link href="/conciliacao" className="btn btn-ghost">← Voltar para a fila</Link>
    {error&&<p role="alert" className="callout callout-err small">{error}</p>}
    {notice&&<p role="status" className="callout callout-ok small">{notice}</p>}
    <section className="card card-lg"><p className="eyebrow">{t.account.name}</p><h1 className="h-display">{t.description}</h1><p>{day(t.occurredOn)} · <strong>{money(t.amountCents)}</strong></p><p className="muted">{pending?REASONS[data.item.reason]??'Aguarda decisão':t.category?`Resolvido · categoria ${t.category.name}`:'Resolvido'}</p></section>

    {pending&&suggestion&&<section className="card stack-sm"><p className="eyebrow">Sugestão de categoria</p><p>A regra “descrição {MATCH[suggestion.rule.matchType]} <strong>{suggestion.rule.pattern}</strong>” indica a categoria <strong>{suggestion.category.name}</strong>.</p><div className="row-tight"><button type="button" disabled={busy} className="btn btn-primary" onClick={()=>decideCategory(suggestion.category.id)}>Aplicar {suggestion.category.name}</button></div></section>}

    {pending&&best?.confidence!=null&&<section className="card stack-sm"><p className="eyebrow">Possível transferência entre suas contas</p><p>Há um lançamento de <strong>{money(best.amountCents)}</strong> em <strong>{best.account.name}</strong> em {day(best.occurredOn)}{best.ownPix?', com uma das suas chaves PIX na descrição':''}. Se for o mesmo dinheiro mudando de conta, pareie os dois: eles deixam de contar como gasto e como receita.</p>{transferCategory?<div className="row-tight"><button type="button" disabled={busy} className="btn btn-primary" onClick={()=>decide({kind:'transfer',counterpartTransactionId:best.id,categoryId:transferCategory.id})}>Parear com o lançamento de {best.account.name}</button></div>:<p className="small muted">Para parear, crie antes uma categoria do tipo Transferência própria. <Link href="/configuracoes/categorias">Abrir categorias</Link></p>}</section>}

    {pending&&<section className="card stack"><h2>Tomar decisão</h2><button type="button" disabled={busy} className="btn btn-neutral" onClick={()=>decide({kind:'confirm'})}>Confirmar como está</button>
      <label className="field">Categoria<select value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Selecione</option>{data.categories.filter(c=>c.kind!=='transfer').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="row-tight small"><input type="checkbox" checked={makeRule} onChange={e=>setMakeRule(e.target.checked)}/>Aplicar também aos lançamentos cuja descrição começa com “{pattern.trim()||data.proposedPattern}”</label>
      {makeRule&&<label className="field">Ajustar o início da descrição<input value={pattern} maxLength={120} onChange={e=>setPattern(e.target.value)}/><span className="field-hint">Vale para os lançamentos pendentes sem categoria e para as próximas importações. Categorias escolhidas à mão não mudam.</span></label>}
      <button type="button" disabled={busy||!categoryId||(makeRule&&pattern.trim().length<2)} className="btn btn-primary" onClick={()=>decideCategory(categoryId)}>Aplicar categoria</button>
      <label className="field">Valor corrigido em centavos<input value={amount} inputMode="numeric" onChange={e=>setAmount(e.target.value)}/></label><button type="button" disabled={busy||!/^[-]?\d+$/.test(amount)} className="btn btn-neutral" onClick={()=>decide({kind:'adjustment',adjustedAmountCents:amount,adjustmentKind:'correction'})}>Registrar ajuste</button>
      {data.obligations.length>0&&<><label className="field">Compromisso correspondente<select value={obligationId} onChange={e=>setObligationId(e.target.value)}><option value="">Selecione</option>{data.obligations.map(o=><option key={o.id} value={o.id}>{o.description} · {money(o.amountCents)} · {day(o.dueDate)}</option>)}</select></label><button type="button" disabled={busy||!obligationId} className="btn btn-neutral" onClick={()=>decide({kind:'obligation',obligationId})}>Marcar compromisso como pago</button></>}
      {transferCategory&&data.transferCandidates.length>0&&<><label className="field">Lançamento correspondente<select value={counterpart} onChange={e=>setCounterpart(e.target.value)}><option value="">Selecione outra conta</option>{data.transferCandidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.account.name} · {day(candidate.occurredOn)} · {candidate.description}{candidate.confidence!=null?' · provável':''}</option>)}</select></label><button type="button" disabled={busy||!counterpart} className="btn btn-neutral" onClick={()=>decide({kind:'transfer',counterpartTransactionId:counterpart,categoryId:transferCategory.id})}>Vincular transferência entre contas</button></>}
    </section>}
    {!!data.item.decisions.length&&<section className="card"><h2>Histórico</h2>{data.item.decisions.map(d=><div key={d.id} className="card-header"><span>{DECISIONS[d.kind]??'Decisão registrada'} · {new Date(d.createdAt).toLocaleString('pt-BR')}{d.revertedAt?' · desfeita':''}</span>{!d.revertedAt&&<button type="button" disabled={busy} className="btn btn-sm btn-neutral" onClick={()=>revert(d.id)}>Desfazer</button>}</div>)}</section>}
  </div>;
}
