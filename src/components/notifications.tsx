'use client';

/* Central de notificações (Stage 10).

   Padrão seguido: o sino com contador no cabeçalho, que abre um painel lateral
   com a lista, "Marcar todas como lidas" e "Ver todas" (GitHub e Gmail na web;
   a Central de Notificações do macOS entra pela lateral). Dispensar mostra
   "Desfazer" no lugar, como o Gmail faz ao arquivar. O modo silencioso segue
   o Foco do macOS e do iOS: as notificações continuam chegando à lista, só o
   número do sino deixa de chamar.

   Toda notificação nasce no backend a partir dos dados locais; esta tela só
   mostra e pede mudanças pela API (docs/ARCHITECTURE.md, §4.8). */

import '@/app/local-data.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError, callApi, getJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';

export type NotificationItem = {
  key: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  href: string;
  actionLabel: string;
  occurredAt: string;
  amountCents: string | null;
  read: boolean;
};

type CenterPayload =
  | { hasProfile: false }
  | { hasProfile: true; notifications: NotificationItem[]; unreadCount: number; badgeCount: number | null; quiet: boolean; dismissedCount: number };

type CenterState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; payload: CenterPayload };

const CHANGED = 'talentum:notificacoes';
const REFRESH_MS = 5 * 60_000;

/** Avisa o sino e as listas abertas de que o estado mudou. */
function announceChange() {
  window.dispatchEvent(new Event(CHANGED));
}

export function useNotificationCenter() {
  const [state, setState] = useState<CenterState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the refresh trigger
  useEffect(() => {
    const controller = new AbortController();
    getJson<CenterPayload>('/api/notifications', controller.signal)
      .then((payload) => setState({ status: 'ready', payload }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((current) => (current.status === 'ready' && error instanceof ApiError ? current : { status: 'error' }));
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    window.addEventListener(CHANGED, refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      window.removeEventListener(CHANGED, refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { state, refresh };
}

async function change(keys: string[] | 'all', patch: { read?: boolean; dismissed?: boolean }) {
  await callApi('PATCH', '/api/notifications', { json: { keys, ...patch } });
  announceChange();
}

const ICON: Record<NotificationItem['severity'], string> = {
  critical: 'bi-exclamation-octagon',
  warning: 'bi-exclamation-triangle',
  info: 'bi-info-circle',
};

const SEVERITY_LABEL: Record<NotificationItem['severity'], string> = {
  critical: 'Urgente',
  warning: 'Atenção',
  info: 'Informação',
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(date);
}

/** Botão do sino no cabeçalho, com o número de não lidas. */
export function NotificationBell({ onOpen }: { onOpen: () => void }) {
  const { state, refresh } = useNotificationCenter();
  const pathname = usePathname();
  // biome-ignore lint/correctness/useExhaustiveDependencies: navigating is the trigger to recount
  useEffect(() => refresh(), [pathname, refresh]);

  const payload = state.status === 'ready' && state.payload.hasProfile ? state.payload : null;
  const count = payload?.badgeCount ?? null;
  const quiet = payload?.quiet ?? false;
  const label = quiet
    ? `Notificações, modo silencioso${payload && payload.unreadCount > 0 ? `, ${payload.unreadCount} não lidas` : ''}`
    : count && count > 0
      ? `Notificações, ${count} ${count === 1 ? 'não lida' : 'não lidas'}`
      : 'Notificações';

  return (
    <button type="button" className="icon-button" onClick={onOpen} aria-label={label} title={label} aria-haspopup="dialog">
      <i className={`bi ${quiet ? 'bi-bell-slash' : 'bi-bell'}`} style={{ fontSize: 16 }} aria-hidden="true" />
      {count !== null && count > 0 && (
        <span className="notif-count" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function NotificationRow({ item, onFollow, onToggleRead, onDismiss, busy }: { item: NotificationItem; onFollow: () => void; onToggleRead: () => void; onDismiss: () => void; busy: boolean }) {
  const money = item.amountCents ? formatCents(item.amountCents) : null;
  return (
    <li className="notif-item" data-severity={item.severity} data-read={item.read ? 'true' : 'false'}>
      <i className={`bi ${ICON[item.severity]}`} aria-hidden="true" />
      <p className="notif-title">
        {!item.read && <span className="notif-unread" aria-hidden="true" />}
        <span className="sr-only">{item.read ? 'Lida. ' : 'Não lida. '}{SEVERITY_LABEL[item.severity]}: </span>
        {item.title}
      </p>
      <p className="notif-body">{item.body}</p>
      <p className="notif-meta">
        <time dateTime={item.occurredAt}>{formatWhen(item.occurredAt)}</time>
        {money && (
          <span className="num">
            Valor: {money.symbol} {money.value}
          </span>
        )}
      </p>
      <div className="notif-actions">
        <Link className="btn btn-sm btn-primary" href={item.href} onClick={onFollow}>
          {item.actionLabel}
        </Link>
        <button type="button" className="btn btn-sm btn-neutral" disabled={busy} onClick={onToggleRead}>
          {item.read ? 'Marcar como não lida' : 'Marcar como lida'}
        </button>
        <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={onDismiss} aria-label={`Dispensar: ${item.title}`}>
          <i className="bi bi-x-lg" aria-hidden="true" />
          Dispensar
        </button>
      </div>
    </li>
  );
}

/**
 * Lista da central, usada no painel e na página. `onNavigate` fecha o painel
 * quando a pessoa segue um link. `empty` é o estado vazio de quem usa a lista.
 */
export function NotificationList({ variant, empty, onNavigate }: { variant: 'panel' | 'page'; empty: ReactNode; onNavigate?: () => void }) {
  const { state, refresh } = useNotificationCenter();
  const [filter, setFilter] = useState<'unread' | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ key: string; title: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try {
      await task();
    } catch {
      setFailure('Não foi possível atualizar a notificação. Nada mudou. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading')
    return (
      <div aria-busy="true">
        <span className="sr-only">Consultando notificações</span>
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="callout callout-warn" role="alert">
        <i className="bi bi-exclamation-triangle" aria-hidden="true" />
        <div>
          <p className="callout-title">Não foi possível consultar as notificações</p>
          <p className="small">Nenhuma notificação é mostrada enquanto a consulta não responder.</p>
          <button type="button" className="btn btn-sm btn-neutral" onClick={refresh}>
            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  if (!state.payload.hasProfile)
    return (
      <div className="stack">
        {empty}
        <Link className="btn btn-neutral" href="/onboarding" onClick={onNavigate}>
          Fazer o primeiro acesso
        </Link>
      </div>
    );

  const { notifications, unreadCount, quiet } = state.payload;
  const visible = filter === 'unread' ? notifications.filter((item) => !item.read) : notifications;

  return (
    <div>
      <div className="notif-toolbar">
        {/* biome-ignore lint/a11y/useSemanticElements: toggle buttons, not a form fieldset */}
        <div className="row-tight" role="group" aria-label="Mostrar notificações">
          <button type="button" className="chip-toggle" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            Todas ({notifications.length})
          </button>
          <button type="button" className="chip-toggle" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>
            Não lidas ({unreadCount})
          </button>
        </div>
        <button type="button" className="btn btn-sm btn-neutral" disabled={busy || unreadCount === 0} onClick={() => void run(() => change('all', { read: true }))}>
          <i className="bi bi-check2-all" aria-hidden="true" />
          Marcar todas como lidas
        </button>
      </div>

      {quiet && (
        <p className="small muted" style={{ margin: '12px 0 0' }}>
          <i className="bi bi-bell-slash" aria-hidden="true" /> Modo silencioso ligado: o sino não mostra o número de não lidas.{' '}
          <Link className="btn-link" href="/configuracoes#notificacoes" onClick={onNavigate}>
            Mudar nas configurações
          </Link>
        </p>
      )}

      <div role="status" aria-live="polite">
        {undo && (
          <div className="undo-strip">
            <span>Notificação dispensada: {undo.title}</span>
            <button
              type="button"
              className="btn btn-sm btn-neutral"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await change([undo.key], { dismissed: false });
                  setUndo(null);
                })
              }
            >
              Desfazer
            </button>
          </div>
        )}
        {failure && <p className="field-error">{failure}</p>}
      </div>

      {visible.length === 0 ? (
        notifications.length === 0 ? (
          empty
        ) : (
          <p className="muted" style={{ marginTop: 16 }}>
            Nenhuma notificação não lida. As já lidas continuam em Todas.
          </p>
        )
      ) : (
        <ul className="notif-list" aria-label={variant === 'panel' ? 'Notificações recentes' : 'Notificações'}>
          {(variant === 'panel' ? visible.slice(0, 20) : visible).map((item) => (
            <NotificationRow
              key={item.key}
              item={item}
              busy={busy}
              onFollow={() => {
                if (!item.read) void change([item.key], { read: true }).catch(() => undefined);
                onNavigate?.();
              }}
              onToggleRead={() => void run(() => change([item.key], { read: !item.read }))}
              onDismiss={() =>
                void run(async () => {
                  await change([item.key], { dismissed: true });
                  setUndo({ key: item.key, title: item.title });
                })
              }
            />
          ))}
        </ul>
      )}

      {variant === 'panel' && (
        <p style={{ marginTop: 16 }}>
          <Link className="btn-link" href="/notificacoes" onClick={onNavigate}>
            Ver todas as notificações
            <i className="bi bi-arrow-right-short" aria-hidden="true" />
          </Link>
        </p>
      )}
    </div>
  );
}
