'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { callApi, getJson, postJson, ApiError } from '@/lib/api-client';
import Link from 'next/link';
import { StateArt, type StateArtName } from '@/components/state-art';
import { formatCents } from '@/lib/format';

const message = (cause: unknown) => cause instanceof ApiError && cause.publicMessage ? cause.publicMessage : 'Não foi possível concluir a operação.';
const toCents = (value: string) => {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number * 100).toString();
};

/* Envio de formulário: trava enquanto o pedido está no ar (por ref, porque os
   dois cliques de um duplo clique chegam antes do próximo render) e manda uma
   chave por envio. A chave só muda depois do sucesso: repetir após uma falha
   de rede devolve o mesmo registro em vez de criar outro.
   tests/regression/double-submit-duplicates-obligation-and-income.test.mjs */
function useSubmission() {
  const pending = useRef(false);
  const key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(work: (idempotencyKey: string) => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    key.current ??= crypto.randomUUID();
    try {
      await work(key.current);
      key.current = null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}

/* Antes do onboarding as rotas respondem { hasProfile: false }, sem lista: a
   tela explica o motivo e leva ao perfil, como Cartões e Metas fazem.
   tests/regression/planning-pages-crash-without-profile.test.mjs */
function NoProfile({ art, title, text }: { art: StateArtName; title: string; text: string }) {
  return (
    <section className="card card-lg empty">
      <StateArt name={art} />
      <h2 className="h-display">{title}</h2>
      <p className="muted">{text}</p>
      <Link className="btn btn-primary" href="/onboarding">
        Configurar perfil
      </Link>
    </section>
  );
}

export function CategoriesPage() {
  const [items, setItems] = useState<{id:string;name:string;kind:string}[]>([]), [name,setName]=useState(''), [kind,setKind]=useState('expense'), [error,setError]=useState(''), [loading,setLoading]=useState(true), [hasProfile,setHasProfile]=useState(true);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const x=await getJson<{hasProfile?:boolean;categories?:typeof items}>('/api/categories');setHasProfile(x.hasProfile!==false);setItems(x.categories??[]);}catch(e){setError(message(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const {busy,run}=useSubmission();
  async function create(event:FormEvent){event.preventDefault();await run(async()=>{await postJson('/api/categories',{name,kind});setName('');await load();}).catch(e=>setError(message(e)));}
  async function remove(id:string){try{await callApi('DELETE',`/api/categories/${id}`);await load();}catch(e){setError(message(e));}}
  if(!hasProfile) return <NoProfile art="perfil-vazio" title="Configure o perfil antes das categorias" text="As categorias pertencem ao perfil local, criado no onboarding." />;
  return <div className="stack-lg"><form className="card card-lg" onSubmit={create}><h2 className="h-display">Nova categoria</h2>{error&&<p className="callout callout-danger" role="alert">{error}</p>}<div className="grid grid-260"><label className="field">Nome<input required maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label><label className="field">Tipo<select value={kind} onChange={e=>setKind(e.target.value)}><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência própria</option></select></label></div><button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>Adicionar categoria</button></form><section className="card"><h2 className="h-display">Categorias</h2>{loading?<p className="muted">Carregando…</p>:items.length===0?<p className="muted">Nenhuma categoria cadastrada.</p>:<ul className="entity-list">{items.map(x=><li key={x.id}><span><strong>{x.name}</strong><small className="muted">{x.kind}</small></span><button type="button" className="btn btn-quiet" onClick={()=>remove(x.id)}>Excluir</button></li>)}</ul>}</section></div>;
}

type Obligation={id:string;description:string;amountCents:string;dueDate:string;status:string;recurrence:string;isEstimated:boolean;creditCardId:string|null};
type CardOption={id:string;name:string};
/* A ligação com o cartão evita descontar duas vezes a mesma conta: com a fatura
   do cartão cadastrada para o mesmo mês, o painel usa a fatura e ignora o
   compromisso (docs/PRODUCT.md, V). O seletor só aparece quando há cartão. */
const cardHint='Com a fatura desse cartão cadastrada para o mesmo mês, o Dashboard desconta só a fatura.';
export function ObligationsPage(){
  const [items,setItems]=useState<Obligation[]>([]),[cards,setCards]=useState<CardOption[]>([]),[description,setDescription]=useState(''),[amount,setAmount]=useState(''),[due,setDue]=useState(''),[recurrence,setRecurrence]=useState('none'),[cardId,setCardId]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[hasProfile,setHasProfile]=useState(true);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const [x,c]=await Promise.all([getJson<{hasProfile?:boolean;obligations?:Obligation[]}>('/api/obligations'),getJson<{cards?:CardOption[]}>('/api/cards').catch(()=>({cards:[]}))]);setHasProfile(x.hasProfile!==false);setItems(x.obligations??[]);setCards((c.cards??[]).map(({id,name})=>({id,name})));}catch(e){setError(message(e));}finally{setLoading(false);}},[]);useEffect(()=>{void load();},[load]);
  const {busy,run}=useSubmission();
  async function create(event:FormEvent){event.preventDefault();const cents=toCents(amount);if(!cents){setError('Informe um valor maior que zero.');return;}await run(async(idempotencyKey)=>{await postJson('/api/obligations',{description,amountCents:cents,dueDate:new Date(`${due}T12:00:00`).toISOString(),status:'open',recurrence,isEstimated:false,creditCardId:cardId||null,idempotencyKey});setDescription('');setAmount('');setDue('');setCardId('');await load();}).catch(e=>setError(message(e)));}
  async function status(id:string,value:string){try{await callApi('PATCH',`/api/obligations/${id}`,{json:{status:value}});await load();}catch(e){setError(message(e));}}
  async function link(id:string,value:string){try{await callApi('PATCH',`/api/obligations/${id}`,{json:{creditCardId:value||null}});await load();}catch(e){setError(message(e));}}
  const cardOptions=<><option value="">Não é fatura de cartão</option>{cards.map(card=><option key={card.id} value={card.id}>Fatura {card.name}</option>)}</>;
  async function remove(id:string){try{await callApi('DELETE',`/api/obligations/${id}`);await load();}catch(e){setError(message(e));}}
  if(!hasProfile) return <NoProfile art="sem-obrigacoes" title="Configure o perfil antes dos compromissos" text="Contas a pagar e recorrências pertencem ao perfil local, criado no onboarding." />;
  return <div className="stack-lg"><form className="card card-lg" onSubmit={create}><h2 className="h-display">Novo compromisso</h2>{error&&<p className="callout callout-danger" role="alert">{error}</p>}<div className="grid grid-260"><label className="field">Descrição<input required maxLength={100} value={description} onChange={e=>setDescription(e.target.value)}/></label><label className="field">Valor<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></label><label className="field">Vencimento<input required type="date" value={due} onChange={e=>setDue(e.target.value)}/></label><label className="field">Recorrência<select value={recurrence} onChange={e=>setRecurrence(e.target.value)}><option value="none">Não recorrente</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option></select></label>{cards.length>0&&<label className="field">Fatura de cartão<select value={cardId} onChange={e=>setCardId(e.target.value)}>{cardOptions}</select><span className="field-hint">{cardHint}</span></label>}</div><button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>Salvar compromisso</button></form><section className="card"><h2 className="h-display">Compromissos</h2>{loading?<p className="muted">Carregando…</p>:items.length===0?<p className="muted">Nenhum compromisso cadastrado.</p>:<ul className="entity-list">{items.map(x=><li key={x.id}><span><strong>{x.description}</strong><small className="muted">R$ {formatCents(x.amountCents).value} · {new Date(x.dueDate).toLocaleDateString('pt-BR')}</small></span><span className="row-tight">{cards.length>0&&<select aria-label={`Fatura de cartão de ${x.description}`} value={x.creditCardId??''} onChange={e=>link(x.id,e.target.value)}>{cardOptions}</select>}<select aria-label={`Estado de ${x.description}`} value={x.status} onChange={e=>status(x.id,e.target.value)}><option value="open">Aberto</option><option value="paid">Pago</option><option value="cancelled">Cancelado</option></select><button type="button" className="btn btn-quiet" onClick={()=>remove(x.id)}>Excluir</button></span></li>)}</ul>}</section></div>;
}

type Income={id:string;description:string;amountCents:string;frequency:string;nextExpectedDate:string|null};
export function IncomesPage(){
  const [items,setItems]=useState<Income[]>([]),[description,setDescription]=useState(''),[amount,setAmount]=useState(''),[frequency,setFrequency]=useState('monthly'),[error,setError]=useState(''),[loading,setLoading]=useState(true),[hasProfile,setHasProfile]=useState(true);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const x=await getJson<{hasProfile?:boolean;incomes?:Income[]}>('/api/incomes');setHasProfile(x.hasProfile!==false);setItems(x.incomes??[]);}catch(e){setError(message(e));}finally{setLoading(false);}},[]);useEffect(()=>{void load();},[load]);
  const {busy,run}=useSubmission();
  async function create(event:FormEvent){event.preventDefault();const cents=toCents(amount);if(!cents){setError('Informe um valor maior que zero.');return;}await run(async(idempotencyKey)=>{await postJson('/api/incomes',{description,amountCents:cents,frequency,idempotencyKey});setDescription('');setAmount('');await load();}).catch(e=>setError(message(e)));}
  if(!hasProfile) return <NoProfile art="perfil-vazio" title="Configure o perfil antes das rendas previstas" text="As fontes de renda pertencem ao perfil local, criado no onboarding." />;
  return <div className="stack-lg"><form className="card card-lg" onSubmit={create}><h2 className="h-display">Nova fonte de renda</h2><p className="muted">Renda prevista não aumenta o Saldo Livre de Risco antes de entrar na conta.</p>{error&&<p className="callout callout-danger" role="alert">{error}</p>}<div className="grid grid-260"><label className="field">Descrição<input required maxLength={100} value={description} onChange={e=>setDescription(e.target.value)}/></label><label className="field">Valor esperado<input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="field">Frequência<select value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="monthly">Mensal</option><option value="biweekly">Quinzenal</option><option value="weekly">Semanal</option><option value="variable">Variável</option><option value="once">Uma vez</option></select></label></div><button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>Salvar fonte</button></form><section className="card"><h2 className="h-display">Fontes de renda</h2>{loading?<p className="muted">Carregando…</p>:items.length===0?<p className="muted">Nenhuma fonte de renda cadastrada.</p>:<ul className="entity-list">{items.map(x=><li key={x.id}><span><strong>{x.description}</strong><small className="muted">R$ {formatCents(x.amountCents).value} · {x.frequency}</small></span></li>)}</ul>}</section></div>;
}
