'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from '@/components/app-state';
import { HOME_AREAS } from '@/lib/demo-data';
import { useLocalSummary, type LocalSummary } from '@/hooks/use-local-summary';
import type { QueryState } from '@/hooks/use-backend-query';
import { StateArt, type StateArtName } from '@/components/state-art';

/* Com ilustração, a ilustração ocupa o lugar do ícone (docs/DESIGN-SYSTEM.md). */
function EmptyState({ icon, art, title, text, action }: { icon?: string; art?: StateArtName; title: string; text: string; action?: ReactNode }) {
  return <section className="card card-lg empty">{art ? <StateArt name={art}/> : <i className={`bi ${icon}`} aria-hidden="true"/>}<h2 className="h-display">{title}</h2><p className="muted">{text}</p>{action}</section>;
}

/* Estado de uma área que depende do banco local. "Nenhum" só aparece quando o
   backend confirma zero; com registros gravados, a tela diz quantos existem em
   vez de fingir que a área está vazia (docs/PRODUCT.md, R-29). */
function AreaState({ state, count, empty, existing }: { state: QueryState<LocalSummary>; count: (summary: Extract<LocalSummary, { hasProfile: true }>) => number; empty: ReactNode; existing: (total: number) => ReactNode }) {
  if (state.status === 'loading') return <section className="card card-lg" aria-busy="true"><span className="skeleton skeleton-eyebrow"/><span className="skeleton skeleton-line"/></section>;
  if (state.status === 'error') return <section className="card card-lg empty error-state" role="alert"><StateArt name="falha-consulta"/><h2 className="h-display">Não foi possível consultar o banco local</h2><p className="muted">Nada é afirmado sobre esta área enquanto a consulta não responder.</p><button type="button" className="btn btn-neutral" onClick={state.retry}><i className="bi bi-arrow-clockwise" aria-hidden="true"/>Tentar novamente</button></section>;
  const total = state.payload.hasProfile ? count(state.payload) : 0;
  return <>{total === 0 ? empty : existing(total)}</>;
}

const plural = (total: number, one: string, many: string) => `${total} ${total === 1 ? one : many}`;

/* Início: porta de entrada do sistema. Não exibe número financeiro de propósito —
   um zero sem confirmação do backend é uma afirmação falsa (docs/PRODUCT.md, D-2). */
export function HomePage() {
  const app = useApp();
  return <div className="stack-lg">
    <section className="card card-lg">
      <h2 className="h-display-lg">Clareza para o presente. Disciplina para o futuro.</h2>
      <p className="muted">Importe um extrato ou cadastre sua posição atual. O Talentum organiza os lançamentos e mostra quanto realmente sobra depois dos compromissos do período.</p>
      <div className="row-tight">
        <button type="button" className="btn btn-primary" onClick={app.openImport}>Importar extrato</button>
        <Link className="btn btn-neutral" href="/onboarding">Cadastrar posição atual</Link>
      </div>
      <div className="callout callout-info">
        <i className="bi bi-hdd" aria-hidden="true" />
        <p className="small">Seus dados financeiros ficam somente neste dispositivo. Extratos, saldos e transações não são enviados à nuvem.</p>
      </div>
    </section>

    <section className="stack">
      <h2 className="h-display">Áreas do sistema</h2>
      <ul className="area-list">
        {HOME_AREAS.map((area) => (
          <li key={area.href}>
            <Link href={area.href}>
              <i className={`bi ${area.icon}`} aria-hidden="true" />
              <span>
                <strong>{area.label}</strong>
                <span className="small muted">{area.text}</span>
              </span>
              <i className="bi bi-chevron-right area-chevron" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  </div>;
}

/* Extratos, importação e detalhe de lote deixaram de ser demonstrações: estão
   implementados em statements.tsx, import-wizard.tsx e import-batch.tsx. */
export function RecurrencesPage(){const summary=useLocalSummary();return <AreaState state={summary} count={(s)=>s.openObligations} empty={<EmptyState art="sem-obrigacoes" title="Nenhuma obrigação cadastrada" text="Contas recorrentes e vencimentos aparecerão depois de gravados pelo backend."/>} existing={(total)=><EmptyState icon="bi-calendar2-check" title={plural(total,"obrigação em aberto","obrigações em aberto")} text="Elas já são descontadas no Saldo Livre de Risco. A edição de obrigações ainda não está disponível nesta versão." action={<Link className="btn btn-neutral" href="/dashboard">Ver no Dashboard</Link>}/>}/>;}
export function ReconciliationPage(){const summary=useLocalSummary();return <AreaState state={summary} count={(s)=>s.pendingTransactions} empty={<EmptyState art="nada-a-conciliar" title="Nada para conciliar" text="Nenhum lançamento aguarda confirmação no banco local."/>} existing={(total)=><EmptyState icon="bi-hourglass-split" title={plural(total,"lançamento aguarda confirmação","lançamentos aguardam confirmação")} text="Lançamentos pendentes só entram no saldo e nos gastos depois de confirmados. A triagem ainda não está disponível nesta versão."/>}/>;}
export function InvestPage(){return <EmptyState art="sem-noticias" title="Notícias ainda não configuradas" text="Nenhuma notícia ou informação de carteira fictícia é exibida."/>;}
export function ArticlePage(){return <EmptyState art="sem-noticias" title="Conteúdo não encontrado" text="O backend não retornou uma notícia para este ID."/>;}
