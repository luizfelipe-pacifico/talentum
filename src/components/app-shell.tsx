'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useApp } from '@/components/app-state';
import { Overlays } from '@/components/overlays';
import { CONTAS, NAV, PAGE_META, TAB_GROUPS, THEME_OPTIONS } from '@/lib/demo-data';

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function pageMeta(pathname: string) {
  return PAGE_META.find((entry) => isActive(pathname, entry.prefix)) ?? PAGE_META[PAGE_META.length - 1];
}

function tabsFor(pathname: string) {
  return TAB_GROUPS.find((group) => isActive(pathname, group.prefix))?.tabs ?? null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const app = useApp();
  const meta = pageMeta(pathname);
  const tabs = tabsFor(pathname);
  const expanded = !app.collapsed;

  const title = meta.title;
  const context =
    app.survival && pathname === '/' ? 'Prioridade hoje: quitar a dívida de maior custo' : meta.context;

  return (
    <div className="shell" style={{ ['--sidebar-w' as string]: app.collapsed ? '76px' : '248px' }}>
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="sidebar-brand">
          <i className="bi bi-bank2" style={{ color: 'var(--amber)', fontSize: 24 }} aria-hidden="true" />
          {expanded && <span className="sidebar-wordmark">Talentum</span>}
        </div>

        <button
          type="button"
          className="sidebar-account"
          onClick={() => app.open('conta')}
          aria-haspopup="dialog"
        >
          <i className="bi bi-bank" style={{ fontSize: 15, color: 'var(--amber)', flex: 'none' }} />
          {expanded && (
            <>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <span className="sidebar-account-label">Conta ativa</span>
                <span className="sidebar-account-name">{CONTAS[app.contaIndex].label}</span>
              </span>
              <i className="bi bi-chevron-expand" style={{ fontSize: 12, color: '#b7b2a9', flex: 'none' }} />
            </>
          )}
        </button>

        <nav className="sidebar-nav" aria-label="Áreas do Talentum">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="nav-item"
                aria-current={active ? 'page' : undefined}
                title={item.label}
              >
                <span className="nav-mark" aria-hidden="true" />
                <i className={`bi ${item.icon}`} />
                {expanded && <span className="nav-label">{item.label}</span>}
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </Link>
            );
          })}
        </nav>

        {app.survival && (
          <div className="sidebar-survival">
            <i className="bi bi-shield-exclamation" />
            {expanded && <span>Modo de sobrevivência ativo. Aportes pausados.</span>}
          </div>
        )}

        <button type="button" className="sidebar-import" onClick={app.openImport} title="Importação rápida">
          <i className="bi bi-cloud-arrow-up" />
          {expanded && <span style={{ whiteSpace: 'nowrap' }}>Importação rápida</span>}
        </button>

        <Link href="/configuracoes" className="sidebar-quiet" title="Configurações">
          <i className="bi bi-gear" />
          {expanded && <span style={{ whiteSpace: 'nowrap' }}>Configurações</span>}
        </Link>

        <button
          type="button"
          className="sidebar-collapse"
          onClick={app.toggleCollapsed}
          aria-label={app.collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={app.collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <i className={`bi ${app.collapsed ? 'bi-chevron-double-right' : 'bi-chevron-double-left'}`} />
          {expanded && <span style={{ whiteSpace: 'nowrap' }}>Recolher menu</span>}
        </button>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <h1 className="page-title">{title}</h1>
            <p className="page-context">{context}</p>
          </div>

          <div className="row-tight">
            <span className="chip" title="Toda a informação exibida é sintética.">
              <i className="bi bi-flask" />
              Dados de demonstração
            </span>

            {app.offline && (
              <span className="chip chip-info chip-lg">
                <i className="bi bi-wifi-off" />
                Offline — dados financeiros disponíveis
              </span>
            )}

            <button type="button" className="btn btn-sm" onClick={() => app.open('express')}>
              <i className="bi bi-cash-coin" style={{ fontSize: 15 }} />
              Lançar dinheiro
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={() => app.open('notif')}
              aria-label="Notificações"
            >
              <i className="bi bi-bell" style={{ fontSize: 16 }} />
              <span className="notif-count">{app.survival ? '6' : '5'}</span>
            </button>

            <div role="group" aria-label="Tema" className="segmented">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => app.setTheme(option.value)}
                  aria-pressed={app.theme === option.value}
                  title={option.value}
                >
                  <i className={`bi ${option.icon}`} />
                  {option.value}
                </button>
              ))}
            </div>

            <Link href="/perfil" className="avatar-button" aria-label="Perfil de Marina Alencar">
              <span className="avatar" aria-hidden="true">
                MA
              </span>
              <span>Nível 3</span>
              <i className="bi bi-chevron-down" style={{ fontSize: 11, color: 'var(--ink2)' }} />
            </Link>
          </div>
        </header>

        {app.survival && (
          <div role="status" className="survival-banner">
            <i className="bi bi-shield-exclamation" />
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 600 }}>
                Modo de sobrevivência ativo
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 13, lineHeight: '19px' }}>
                Sugestões de aporte estão pausadas. A prioridade agora é a dívida de maior custo: fatura Vega,
                juros de 14,9% ao mês.
              </p>
            </div>
            <Link href="/extratos/recorrencias" className="btn btn-sm btn-neutral">
              Ver dívidas prioritárias
            </Link>
          </div>
        )}

        <main className="content">
          <div className="content-inner">
            {tabs && (
              <div role="tablist" className="tabs">
                {tabs.map((tab) => (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    role="tab"
                    aria-selected={pathname === tab.href}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>

      <Overlays />
    </div>
  );
}
