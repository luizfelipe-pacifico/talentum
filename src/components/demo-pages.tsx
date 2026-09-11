'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from '@/components/app-state';
import { HOME_AREAS } from '@/lib/demo-data';

function SectionTitle({ title }: { title: string }) {
  return <div className="card-header"><h2 className="h-display">{title}</h2></div>;
}

function EmptyState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return <section className="card card-lg empty"><i className={`bi ${icon}`} aria-hidden="true"/><h2 className="h-display">{title}</h2><p className="muted">{text}</p>{action}</section>;
}

/* Início: porta de entrada do sistema. Não exibe número financeiro de propósito —
   um zero sem confirmação do backend é uma afirmação falsa (docs/DASHBOARD.md, D-2). */
export function HomePage() {
  const app = useApp();
  return <div className="stack-lg">
    <section className="card card-lg">
      <p className="eyebrow">Talentum</p>
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
      <div className="grid grid-260">
        {HOME_AREAS.map((area) => (
          <Link key={area.href} href={area.href} className="card card-sm home-area">
            <span className="home-area-head">
              <i className={`bi ${area.icon}`} aria-hidden="true" />
              <span className="home-area-title">{area.label}</span>
            </span>
            <span className="small muted">{area.text}</span>
            <span className="btn-link">Abrir<i className="bi bi-arrow-right-short" aria-hidden="true" /></span>
          </Link>
        ))}
      </div>
    </section>
  </div>;
}

export function StatementsPage(){const app=useApp();return <EmptyState icon="bi-receipt" title="Nenhum lançamento" text="As transações aparecerão somente depois de persistidas pelo backend local." action={<button className="btn btn-primary" onClick={app.openImport}>Importar extrato</button>}/>;}
export function CardsPage(){return <EmptyState icon="bi-credit-card" title="Nenhum cartão cadastrado" text="Cartões e faturas serão exibidos quando existirem no banco local."/>;}
export function ImportPage({batch=false}:{batch?:boolean}){const app=useApp();return <EmptyState icon="bi-file-earmark-arrow-up" title={batch?'Lote não encontrado':'Importar extrato'} text={batch?'O backend não retornou um lote para este ID.':'CSV e OFX serão processados localmente e gravados por lote no SQLite.'} action={!batch?<button className="btn btn-primary" onClick={app.openImport}>Selecionar arquivo</button>:undefined}/>;}
export function RecurrencesPage(){return <EmptyState icon="bi-calendar2-check" title="Nenhuma obrigação cadastrada" text="Contas recorrentes e vencimentos aparecerão depois de gravados pelo backend."/>;}
export function ReconciliationPage(){return <EmptyState icon="bi-check2-square" title="Nada para conciliar" text="A fila será preenchida com transações pendentes retornadas pelo backend local."/>;}
export function InvoiceCheckPage(){return <EmptyState icon="bi-receipt-cutoff" title="Nenhuma fatura para conferir" text="A conferência será habilitada quando uma fatura existir no banco local."/>;}
export function PortfolioPage(){return <EmptyState icon="bi-columns-gap" title="Nenhum patrimônio cadastrado" text="Ativos, posições e saldos aparecerão somente depois do cadastro local." action={<Link className="btn btn-primary" href="/onboarding">Cadastrar posição atual</Link>}/>;}
export function ContributionsPage(){return <EmptyState icon="bi-plus-circle" title="Aporte indisponível" text="Cadastre seu patrimônio antes de simular ou registrar um aporte."/>;}
export function GoalsPage(){return <EmptyState icon="bi-flag" title="Nenhuma meta cadastrada" text="As metas aparecerão quando forem persistidas pelo backend local."/>;}
export function InvestPage(){return <EmptyState icon="bi-newspaper" title="Notícias ainda não configuradas" text="Nenhuma notícia ou informação de carteira fictícia é exibida."/>;}
export function ArticlePage(){return <EmptyState icon="bi-file-text" title="Conteúdo não encontrado" text="O backend não retornou uma notícia para este ID."/>;}
export function HistoryPage(){return <EmptyState icon="bi-clock-history" title="Histórico vazio" text="Importações e alterações aparecerão quando eventos reais forem persistidos."/>;}
export function ProfilePage(){return <EmptyState icon="bi-person" title="Perfil ainda não configurado" text="Conclua o onboarding para criar o perfil local." action={<Link className="btn btn-primary" href="/onboarding">Configurar perfil</Link>}/>;}
export function PrivacyPage(){return <div className="grid grid-320"><article className="card"><SectionTitle title="Banco de dados local"/><p className="metric">SQLite</p><p className="small muted">Os dados financeiros permanecem neste dispositivo e são acessados pelo backend local.</p></article><article className="card"><SectionTitle title="Backup cifrado"/><span className="chip chip-warn"><i className="bi bi-cone-striped"/>Planejado</span><p className="small muted">Nenhum backup foi criado ou enviado.</p></article></div>;}
export function SettingsPage(){const app=useApp();return <div className="settings-grid"><section className="card"><SectionTitle title="Aparência"/><label className="field">Tema<select value={app.theme} onChange={event=>app.setTheme(event.target.value as typeof app.theme)}><option>Claro</option><option>Escuro</option><option>Sistema</option></select></label></section><section className="card"><SectionTitle title="Sobre"/><p>Talentum · pré-alpha</p><p className="small muted">Piloto automático financeiro local-first e open-source.</p><Link className="btn-link" href="/layout-guide">Guia de layout<i className="bi bi-arrow-right-short"/></Link></section></div>;}
export function OnboardingPage(){const app=useApp();return <section className="card card-lg"><p className="eyebrow">Primeiro acesso</p><h2 className="h-display-lg">Construa sua base financeira</h2><p className="muted">Cadastre sua posição atual ou importe um extrato. Nenhum valor é presumido pelo aplicativo.</p><div className="callout callout-info"><i className="bi bi-hdd"/><p>As informações financeiras ficam no SQLite local e chegam ao frontend somente por APIs do backend.</p></div><button className="btn btn-primary" onClick={app.openImport}>Importar primeiro extrato</button></section>;}
export function DetailPage({kind}:{kind:'card'|'goal'}){return <EmptyState icon={kind==='card'?'bi-credit-card':'bi-flag'} title={kind==='card'?'Cartão não encontrado':'Meta não encontrada'} text="O backend não retornou dados para este ID."/>;}
