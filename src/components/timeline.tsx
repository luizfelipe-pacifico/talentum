'use client';

/* Linha do tempo local (Feature 8, Stage 11).

   Dois filtros, assunto e período, ficam visíveis ao lado da lista em todo
   tamanho de tela: com só dois, o efeito de cada mudança aparece na hora
   (docs/DESIGN-SYSTEM.md, Pattern catalog, Filters). No celular eles ocupam a
   largura toda, um abaixo do outro. A lista carrega 50 eventos por vez, com
   "Carregar mais eventos", como o histórico de atividade do GitHub. */

import '@/app/local-data.css';
import { useCallback, useEffect, useState } from 'react';
import { StateArt } from '@/components/state-art';
import { getJson, postJson } from '@/lib/api-client';

type Event = { id: string; kind: string; domain: string | null; title: string; description: string; reversible: boolean; revertedAt: string | null; createdAt: string };
type Page = { hasProfile: boolean; events?: Event[]; nextCursor?: string | null };

const DOMAINS = [
  { value: '', label: 'Todos os assuntos' },
  { value: 'imports', label: 'Importações' },
  { value: 'transactions', label: 'Lançamentos' },
  { value: 'reconciliation', label: 'Conciliação' },
  { value: 'planning', label: 'Planejamento' },
  { value: 'data', label: 'Dados e backup' },
  { value: 'progress', label: 'Progresso' },
];

const DOMAIN_LABEL: Record<string, string> = Object.fromEntries(DOMAINS.filter((d) => d.value).map((d) => [d.value, d.label]));

const PERIODS = [
  { value: '', label: 'Todo o período' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '365', label: 'Últimos 12 meses' },
];

/** Início do dia local de N dias atrás, em ISO: o backend só confere o instante. */
function periodStart(days: string): string | null {
  if (!days) return null;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(days) + 1).toISOString();
}

function query(domain: string, period: string, cursor?: string | null) {
  const params = new URLSearchParams();
  if (domain) params.set('domain', domain);
  const from = periodStart(period);
  if (from) params.set('from', from);
  if (cursor) params.set('cursor', cursor);
  const text = params.toString();
  return `/api/timeline-events${text ? `?${text}` : ''}`;
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function TimelinePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [domain, setDomain] = useState('');
  const [period, setPeriod] = useState('');
  const [busy, setBusy] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus('loading');
    getJson<Page>(query(domain, period))
      .then((page) => {
        setEvents(page.events ?? []);
        setNextCursor(page.nextCursor ?? null);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [domain, period]);
  useEffect(() => void load(), [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await getJson<Page>(query(domain, period, nextCursor));
      setEvents((current) => [...current, ...(page.events ?? [])]);
      setNextCursor(page.nextCursor ?? null);
    } catch {
      setNotice('Não foi possível carregar mais eventos. Tente de novo.');
    } finally {
      setLoadingMore(false);
    }
  };

  const revert = async (id: string) => {
    setBusy(id);
    setNotice(null);
    try {
      await postJson(`/api/timeline-events/${id}/revert`, {});
      load();
    } catch {
      setNotice('Não foi possível desfazer este evento. Os dados relacionados mudaram ou a consulta falhou; nada foi alterado.');
    } finally {
      setBusy('');
    }
  };

  const filtered = domain !== '' || period !== '';

  return (
    <div className="stack-lg">
      <section className="card card-lg">
        <p className="eyebrow">Histórico local</p>
        <h2 className="h-display">Linha do tempo</h2>
        <p className="small muted">Importações, edições, conciliações e operações de backup feitas neste computador. Eventos marcados com Desfazer podem ser revertidos.</p>
        <div className="timeline-filters">
          <label className="field">
            Assunto
            <select value={domain} onChange={(event) => setDomain(event.target.value)}>
              {DOMAINS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Período
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              {PERIODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <button
              type="button"
              className="btn btn-neutral"
              onClick={() => {
                setDomain('');
                setPeriod('');
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      <p role="status" aria-live="polite" className="field-error">
        {notice ?? ''}
      </p>

      {status === 'loading' ? (
        <section className="card" aria-busy="true">
          <p className="muted">Consultando o histórico local…</p>
        </section>
      ) : status === 'error' ? (
        <section className="card empty error-state" role="alert">
          <StateArt name="falha-consulta" size="sm" />
          <h2 className="h-display">Histórico indisponível</h2>
          <p className="muted">Não foi possível consultar seus dados. Nada foi alterado.</p>
          <button type="button" className="btn btn-neutral" onClick={load}>
            Tentar novamente
          </button>
        </section>
      ) : events.length === 0 ? (
        <section className="card empty">
          <StateArt name="historico-vazio" />
          <h2 className="h-display">{filtered ? 'Nenhum evento neste filtro' : 'Histórico vazio'}</h2>
          <p className="muted">
            {filtered ? 'Escolha outro assunto ou um período maior.' : 'Importações, edições de lançamentos, conciliações e pontos de restauração aparecem aqui.'}
          </p>
        </section>
      ) : (
        <>
          <ul className="timeline">
            {events.map((event) => (
              <li key={event.id}>
                <span className="timeline-dot">
                  <i className="bi bi-clock-history" aria-hidden="true" />
                </span>
                <div className="card">
                  <div className="card-header">
                    <div>
                      <small className="eyebrow">{(event.domain && DOMAIN_LABEL[event.domain]) ?? 'Sistema'}</small>
                      <h3>{event.title}</h3>
                    </div>
                    <time className="muted" dateTime={event.createdAt}>
                      {dateFormatter.format(new Date(event.createdAt))}
                    </time>
                  </div>
                  <p>{event.description}</p>
                  {event.revertedAt ? (
                    <span className="muted">Desfeito em {dateFormatter.format(new Date(event.revertedAt))}</span>
                  ) : (
                    event.reversible && (
                      <button type="button" disabled={busy === event.id} className="btn btn-sm btn-neutral" onClick={() => void revert(event.id)}>
                        <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                        {busy === event.id ? 'Desfazendo…' : 'Desfazer'}
                      </button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <button type="button" className="btn btn-neutral" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Carregando eventos…' : 'Carregar mais eventos'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
