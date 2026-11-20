'use client';

/* Configurações: aparência, notificações e sobre.

   As preferências de notificação seguem o painel de notificações do sistema
   (macOS, iOS, Android): um interruptor geral de silêncio e um por tipo, cada
   um dizendo o que dispara o aviso. A gravação é imediata e idempotente
   (PUT do conjunto inteiro), como nos ajustes do sistema, sem botão "Salvar". */

import '@/app/local-data.css';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app-state';
import { callApi, getJson } from '@/lib/api-client';

type KindPreference = { kind: string; label: string; description: string; enabled: boolean };
type Preferences = { hasProfile: false } | { hasProfile: true; quiet: boolean; kinds: KindPreference[] };

function NotificationPreferences() {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; payload: Preferences }>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    getJson<Preferences>('/api/notification-preferences')
      .then((payload) => setState({ status: 'ready', payload }))
      .catch(() => setState({ status: 'error' }));
  }, []);
  useEffect(load, [load]);

  if (state.status === 'loading')
    return (
      <div aria-busy="true">
        <span className="sr-only">Consultando preferências de notificação</span>
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="callout callout-warn" role="alert">
        <i className="bi bi-exclamation-triangle" aria-hidden="true" />
        <div>
          <p className="small">Não foi possível consultar as preferências de notificação.</p>
          <button type="button" className="btn btn-sm btn-neutral" onClick={load}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  if (!state.payload.hasProfile)
    return (
      <p className="small muted">
        As preferências de notificação ficam disponíveis depois do primeiro acesso. <Link className="btn-link" href="/onboarding">Fazer o primeiro acesso</Link>
      </p>
    );

  const current = state.payload;
  const save = async (next: { quiet: boolean; kinds: KindPreference[] }) => {
    setSaving(true);
    setMessage(null);
    const previous = current;
    setState({ status: 'ready', payload: { hasProfile: true, ...next } });
    try {
      const saved = await callApi<Preferences>('PUT', '/api/notification-preferences', {
        json: { quiet: next.quiet, kinds: Object.fromEntries(next.kinds.map((item) => [item.kind, item.enabled])) },
      });
      setState({ status: 'ready', payload: saved });
      setMessage({ tone: 'ok', text: 'Preferência salva.' });
      window.dispatchEvent(new Event('talentum:notificacoes'));
    } catch {
      setState({ status: 'ready', payload: previous });
      setMessage({ tone: 'error', text: 'Não foi possível salvar. A preferência anterior continua valendo.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <label className="check-field">
        <input type="checkbox" checked={current.quiet} disabled={saving} onChange={(event) => void save({ quiet: event.target.checked, kinds: current.kinds })} />
        <span>
          <strong>Modo silencioso</strong>
          <br />
          <span className="small muted">O sino deixa de mostrar o número de não lidas. As notificações continuam na lista.</span>
        </span>
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="eyebrow">Avisar quando</legend>
        {current.kinds.map((item) => (
          <label key={item.kind} className="check-field">
            <input
              type="checkbox"
              checked={item.enabled}
              disabled={saving}
              onChange={(event) =>
                void save({ quiet: current.quiet, kinds: current.kinds.map((other) => (other.kind === item.kind ? { ...other, enabled: event.target.checked } : other)) })
              }
            />
            <span>
              <strong>{item.label}</strong>
              <br />
              <span className="small muted">{item.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p role="status" aria-live="polite" className={message?.tone === 'error' ? 'field-error' : 'small muted'}>
        {message?.text ?? ''}
      </p>
    </div>
  );
}

export function SettingsScreen() {
  const app = useApp();
  return (
    <div className="settings-grid">
      <section className="card">
        <div className="card-header">
          <h2 className="h-display">Aparência</h2>
        </div>
        <label className="field">
          Tema
          <select value={app.theme} onChange={(event) => app.setTheme(event.target.value as typeof app.theme)}>
            <option>Claro</option>
            <option>Escuro</option>
            <option>Sistema</option>
          </select>
        </label>
      </section>
      <section className="card" id="notificacoes" aria-labelledby="titulo-notificacoes">
        <div className="card-header">
          <h2 className="h-display" id="titulo-notificacoes">
            Notificações
          </h2>
        </div>
        <NotificationPreferences />
      </section>
      <section className="card">
        <div className="card-header">
          <h2 className="h-display">Sobre</h2>
        </div>
        <p>Talentum · pré-alpha</p>
        <p className="small muted">Piloto automático financeiro local-first e open-source.</p>
        <Link className="btn-link" href="/perfil/privacidade">
          Dados e backup
          <i className="bi bi-arrow-right-short" aria-hidden="true" />
        </Link>
        {process.env.NODE_ENV === 'development' && (
          <Link className="btn-link" href="/layout-guide">
            Guia de layout
            <i className="bi bi-arrow-right-short" aria-hidden="true" />
          </Link>
        )}
      </section>
    </div>
  );
}
