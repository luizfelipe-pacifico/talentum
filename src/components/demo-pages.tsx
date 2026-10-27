'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from '@/components/app-state';
import { HOME_AREAS } from '@/lib/demo-data';
import { useLocalSummary, type LocalSummary } from '@/hooks/use-local-summary';
import type { QueryState } from '@/hooks/use-backend-query';
import { StateArt, type StateArtName } from '@/components/state-art';

function SectionTitle({ title }: { title: string }) {
  return <div className="card-header"><h2 className="h-display">{title}</h2></div>;
}

/* Com ilustração, a ilustração ocupa o lugar do ícone (docs/ESTADOS_VAZIOS.md). */
function EmptyState({ icon, art, title, text, action }: { icon?: string; art?: StateArtName; title: string; text: string; action?: ReactNode }) {
  return <section className="card card-lg empty">{art ? <StateArt name={art}/> : <i className={`bi ${icon}`} aria-hidden="true"/>}<h2 className="h-display">{title}</h2><p className="muted">{text}</p>{action}</section>;
}

/* Estado de uma área que depende do banco local. "Nenhum" só aparece quando o
   backend confirma zero; com registros gravados, a tela diz quantos existem em
   vez de fingir que a área está vazia (docs/DASHBOARD.md, R-29). */
function AreaState({ state, count, empty, existing }: { state: QueryState<LocalSummary>; count: (summary: Extract<LocalSummary, { hasProfile: true }>) => number; empty: ReactNode; existing: (total: number) => ReactNode }) {
  if (state.status === 'loading') return <section className="card card-lg" aria-busy="true"><span className="skeleton skeleton-eyebrow"/><span className="skeleton skeleton-line"/></section>;
  if (state.status === 'error') return <section className="card card-lg empty error-state" role="alert"><StateArt name="falha-consulta"/><h2 className="h-display">Não foi possível consultar o banco local</h2><p className="muted">Nada é afirmado sobre esta área enquanto a consulta não responder.</p><button type="button" className="btn btn-neutral" onClick={state.retry}><i className="bi bi-arrow-clockwise" aria-hidden="true"/>Tentar novamente</button></section>;
  const total = state.payload.hasProfile ? count(state.payload) : 0;
  return <>{total === 0 ? empty : existing(total)}</>;
}

const plural = (total: number, one: string, many: string) => `${total} ${total === 1 ? one : many}`;

/* Início: porta de entrada do sistema. Não exibe número financeiro de propósito —
   um zero sem confirmação do backend é uma afirmação falsa (docs/DASHBOARD.md, D-2). */
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

export function StatementsPage(){const app=useApp();const summary=useLocalSummary();return <AreaState state={summary} count={(s)=>s.transactions} empty={<EmptyState art="sem-lancamentos" title="Nenhum lançamento" text="As transações aparecerão somente depois de persistidas pelo backend local." action={<button className="btn btn-primary" onClick={app.openImport}>Importar extrato</button>}/>} existing={(total)=><EmptyState icon="bi-receipt" title={plural(total,"lançamento salvo","lançamentos salvos")} text="A listagem detalhada ainda não está disponível nesta versão. Os valores já entram nos indicadores do Dashboard." action={<Link className="btn btn-neutral" href="/dashboard">Abrir Dashboard</Link>}/>}/>;}
export function CardsPage(){return <EmptyState art="sem-cartoes" title="Nenhum cartão cadastrado" text="Cartões e faturas serão exibidos quando existirem no banco local."/>;}
export function ImportPage({batch=false}:{batch?:boolean}){const app=useApp();return <EmptyState art="importar-extrato" title={batch?'Lote não encontrado':'Importar extrato'} text={batch?'O backend não retornou um lote para este ID.':'CSV e OFX serão processados localmente e gravados por lote no SQLite.'} action={!batch?<button className="btn btn-primary" onClick={app.openImport}>Selecionar arquivo</button>:undefined}/>;}
export function RecurrencesPage(){const summary=useLocalSummary();return <AreaState state={summary} count={(s)=>s.openObligations} empty={<EmptyState art="sem-obrigacoes" title="Nenhuma obrigação cadastrada" text="Contas recorrentes e vencimentos aparecerão depois de gravados pelo backend."/>} existing={(total)=><EmptyState icon="bi-calendar2-check" title={plural(total,"obrigação em aberto","obrigações em aberto")} text="Elas já são descontadas no Saldo Livre de Risco. A edição de obrigações ainda não está disponível nesta versão." action={<Link className="btn btn-neutral" href="/dashboard">Ver no Dashboard</Link>}/>}/>;}
export function ReconciliationPage(){const summary=useLocalSummary();return <AreaState state={summary} count={(s)=>s.pendingTransactions} empty={<EmptyState art="nada-a-conciliar" title="Nada para conciliar" text="Nenhum lançamento aguarda confirmação no banco local."/>} existing={(total)=><EmptyState icon="bi-hourglass-split" title={plural(total,"lançamento aguarda confirmação","lançamentos aguardam confirmação")} text="Lançamentos pendentes só entram no saldo e nos gastos depois de confirmados. A triagem ainda não está disponível nesta versão."/>}/>;}
export function InvoiceCheckPage(){return <EmptyState art="sem-faturas" title="Nenhuma fatura para conferir" text="A conferência será habilitada quando uma fatura existir no banco local."/>;}
export function PortfolioPage(){return <EmptyState art="sem-patrimonio" title="Nenhum patrimônio cadastrado" text="Ativos, posições e saldos aparecerão somente depois do cadastro local." action={<Link className="btn btn-primary" href="/onboarding">Cadastrar posição atual</Link>}/>;}
export function ContributionsPage(){return <EmptyState art="sem-patrimonio" title="Aporte indisponível" text="Cadastre seu patrimônio antes de simular ou registrar um aporte."/>;}
export function GoalsPage(){return <EmptyState art="sem-metas" title="Nenhuma meta cadastrada" text="As metas aparecerão quando forem persistidas pelo backend local."/>;}
export function InvestPage(){return <EmptyState art="sem-noticias" title="Notícias ainda não configuradas" text="Nenhuma notícia ou informação de carteira fictícia é exibida."/>;}
export function ArticlePage(){return <EmptyState art="sem-noticias" title="Conteúdo não encontrado" text="O backend não retornou uma notícia para este ID."/>;}
export function HistoryPage(){return <EmptyState art="historico-vazio" title="Histórico vazio" text="Importações e alterações aparecerão quando eventos reais forem persistidos."/>;}
export function ProfilePage(){return <EmptyState art="perfil-vazio" title="Perfil ainda não configurado" text="Conclua o onboarding para criar o perfil local." action={<Link className="btn btn-primary" href="/onboarding">Configurar perfil</Link>}/>;}
export function PrivacyPage(){return <div className="grid grid-320"><article className="card"><SectionTitle title="Banco de dados local"/><p className="metric">SQLite</p><p className="small muted">Os dados financeiros permanecem neste dispositivo e são acessados pelo backend local.</p></article><article className="card"><SectionTitle title="Backup cifrado"/><span className="chip chip-warn"><i className="bi bi-cone-striped"/>Planejado</span><p className="small muted">Nenhum backup foi criado ou enviado.</p></article></div>;}
export function SettingsPage(){const app=useApp();return <div className="settings-grid"><section className="card"><SectionTitle title="Aparência"/><label className="field">Tema<select value={app.theme} onChange={event=>app.setTheme(event.target.value as typeof app.theme)}><option>Claro</option><option>Escuro</option><option>Sistema</option></select></label></section><section className="card"><SectionTitle title="Sobre"/><p>Talentum · pré-alpha</p><p className="small muted">Piloto automático financeiro local-first e open-source.</p>{process.env.NODE_ENV === 'development' && <Link className="btn-link" href="/layout-guide">Guia de layout<i className="bi bi-arrow-right-short"/></Link>}</section></div>;}
export function OnboardingPage(){const app=useApp();return <section className="card card-lg"><h2 className="h-display-lg">Construa sua base financeira</h2><p className="muted">Cadastre sua posição atual ou importe um extrato. Nenhum valor é presumido pelo aplicativo.</p><div className="callout callout-info"><i className="bi bi-hdd"/><p>As informações financeiras ficam no SQLite local e chegam ao frontend somente por APIs do backend.</p></div><button className="btn btn-primary" onClick={app.openImport}>Importar primeiro extrato</button></section>;}
export function DetailPage({kind}:{kind:'card'|'goal'}){return <EmptyState art={kind==='card'?'sem-cartoes':'sem-metas'} title={kind==='card'?'Cartão não encontrado':'Meta não encontrada'} text="O backend não retornou dados para este ID."/>;}
