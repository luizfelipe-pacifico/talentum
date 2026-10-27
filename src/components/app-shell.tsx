'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { trapFocus } from '@/lib/focus-trap';
import logoDark from '../../icon-talentum-dark.svg';
import { useApp } from '@/components/app-state';
import { Overlays } from '@/components/overlays';
import { NAV, THEME_OPTIONS } from '@/lib/demo-data';
import { activeTab as findActiveTab, isActive, pageMeta, tabsFor } from '@/lib/navigation';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const app = useApp();

  /* Abaixo de 900 px a barra lateral vira gaveta (globals.css). Aqui ficam o
     estado da gaveta e o que o CSS não resolve: rótulos visíveis, foco preso,
     Esc, fechar ao navegar e tirar a gaveta fechada do teclado. */
  const [narrow, setNarrow] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!narrow || !navOpen || !sidebarRef.current) return;
    const release = trapFocus(sidebarRef.current);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      release();
    };
  }, [narrow, navOpen]);

  // A landing page é uma página pública inteira: ela não usa sidebar nem topbar
  // do aplicativo. Ponte temporária de pré-visualização em /lp.
  if (pathname === '/lp' || pathname.startsWith('/lp/')) return <>{children}</>;
  const meta = pageMeta(pathname);
  const tabs = tabsFor(pathname);
  const activeTab = findActiveTab(pathname);
  // Na gaveta os rótulos aparecem sempre; recolher só vale para a barra fixa.
  const expanded = !app.collapsed || narrow;

  const title = meta.title;
  const context =
    app.survival && pathname === '/' ? 'Prioridade hoje: quitar a dívida de maior custo' : meta.context;

  return (
    <div className="shell" data-nav={narrow && navOpen ? 'open' : 'closed'} style={{ ['--sidebar-w' as string]: app.collapsed ? '76px' : '248px' }}>
      <aside
        ref={sidebarRef}
        id="navegacao-principal"
        className="sidebar"
        aria-label="Navegação principal"
        inert={narrow && !navOpen}
      >
        {/* A marca é o caminho para o Início: não existe item "Início" na navegação. */}
        <Link
          href="/"
          className="sidebar-brand"
          aria-label="Início do Talentum"
          aria-current={pathname === '/' ? 'page' : undefined}
          title="Início"
        >
          <span className="brand-symbol" aria-hidden="true">
            <Image className="brand-logo" src={logoDark} alt="" priority unoptimized />
          </span>
          {expanded && <span className="sidebar-wordmark">Talentum</span>}
        </Link>

        <button
          type="button"
          className="sidebar-account"
          onClick={() => app.open('conta')}
          aria-label="Conta ativa: Todas as contas"
          title="Conta ativa: Todas as contas"
          aria-haspopup="dialog"
        >
          <i className="bi bi-bank" style={{ fontSize: 15, color: 'var(--amber)', flex: 'none' }} />
          {expanded && (
            <>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <span className="sidebar-account-label">Conta ativa</span>
                <span className="sidebar-account-name">Todas as contas</span>
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
                aria-label={item.label}
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

        <button type="button" className="sidebar-import" onClick={app.openImport} aria-label="Importação rápida" title="Importação rápida">
          <i className="bi bi-cloud-arrow-up" />
          {expanded && <span style={{ whiteSpace: 'nowrap' }}>Importação rápida</span>}
        </button>

        <Link href="/configuracoes" className="sidebar-quiet" aria-label="Configurações" title="Configurações">
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

      {narrow && navOpen && (
        <button type="button" className="nav-scrim" aria-label="Fechar menu" onClick={() => setNavOpen(false)} />
      )}

      <div className="shell-main">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            onClick={() => setNavOpen((open) => !open)}
            aria-label={navOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={navOpen}
            aria-controls="navegacao-principal"
          >
            <i className="bi bi-list" aria-hidden="true" />
          </button>
          <div className="topbar-heading">
            <h1 className="page-title">{title}</h1>
            <p className="page-context">{context}</p>
          </div>

          <div className="row-tight">
            {app.offline && (
              <span className="chip chip-info chip-lg">
                <i className="bi bi-wifi-off" />
                Offline — dados financeiros disponíveis
              </span>
            )}

            <button type="button" className="btn btn-sm" onClick={() => app.open('express')} aria-label="Lançar dinheiro">
              <i className="bi bi-cash-coin" style={{ fontSize: 15 }} aria-hidden="true" />
              <span className="btn-label">Lançar dinheiro</span>
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={() => app.open('notif')}
              aria-label="Notificações"
            >
              <i className="bi bi-bell" style={{ fontSize: 16 }} />
            </button>

            <label className="theme-select" title="Tema da interface">
              <span className="sr-only">Tema da interface</span>
              <i className={`bi ${THEME_OPTIONS.find((option) => option.value === app.theme)?.icon ?? 'bi-circle-half'}`} />
              <select aria-label="Tema da interface" value={app.theme} onChange={(event) => app.setTheme(event.target.value as typeof app.theme)}>
                {THEME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.value}</option>)}
              </select>
              <i className="bi bi-chevron-down theme-select-chevron" aria-hidden="true" />
            </label>

            <Link href="/perfil" className="avatar-button" aria-label="Configurar perfil local">
              <span className="avatar" aria-hidden="true">
                --
              </span>
              <span>Configurar perfil</span>
              <i className="bi bi-chevron-down" style={{ fontSize: 11, color: 'var(--ink2)' }} />
            </Link>

            <div className="window-controls" aria-label="Controles da janela">
              <button type="button" onClick={() => window.talentumWindow?.minimize()} aria-label="Minimizar" title="Minimizar">
                <i className="bi bi-dash-lg" />
              </button>
              <button type="button" onClick={() => window.talentumWindow?.toggleMaximize()} aria-label="Maximizar ou restaurar" title="Maximizar ou restaurar">
                <i className="bi bi-square" />
              </button>
              <button type="button" onClick={() => window.talentumWindow?.close()} aria-label="Fechar" title="Fechar">
                <i className="bi bi-x-lg" />
              </button>
            </div>
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
                Sugestões de aporte ficam pausadas enquanto este modo estiver ativo. Nenhuma dívida foi carregada.
              </p>
            </div>
            <Link href="/extratos/recorrencias" className="btn btn-sm btn-neutral">
              Ver obrigações
            </Link>
          </div>
        )}

        <main className="content">
          <div className="content-inner">
            {tabs && (
              <nav className="tabs" aria-label={`Seções de ${meta.title}`}>
                {tabs.map((tab) => (
                  <Link key={tab.href} href={tab.href} aria-current={activeTab === tab.href ? 'page' : undefined}>
                    {tab.label}
                  </Link>
                ))}
              </nav>
            )}
            {children}
          </div>
        </main>
      </div>

      <Overlays />
    </div>
  );
}
