'use client';

import '@/app/planning.css';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, getJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';
import { StateArt, type StateArtName } from '@/components/state-art';

/* Peças comuns das telas de orçamento, metas, dívidas e patrimônio.

   Seguem as regras do painel em docs/PRODUCT.md: quatro estados por tela
   (R-28), zero só depois da confirmação do backend (R-29) e nenhum piscar
   de esqueleto ao recarregar (R-30). */

export type Reloadable<T> =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void; notFound: boolean }
  | { status: 'ready'; payload: T; refreshing: boolean; reload: () => Promise<void> };

/**
 * Consulta GET que pode ser recarregada depois de uma escrita.
 *
 * Ao recarregar, mantém o resultado anterior visível (com `refreshing`) em
 * vez de voltar ao esqueleto: a tela não pisca nem muda de altura.
 */
export function useReloadable<T>(path: string): Reloadable<T> {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; notFound: boolean } | { status: 'ready'; payload: T; refreshing: boolean }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger; changing it refetches
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setState((previous) => (previous.status === 'ready' ? { ...previous, refreshing: true } : { status: 'loading' }));
    getJson<T>(path, controller.signal)
      .then((payload) => current && setState({ status: 'ready', payload, refreshing: false }))
      .catch((cause) => current && setState({ status: 'error', notFound: isNotFound(cause) }));
    return () => {
      current = false;
      controller.abort();
    };
  }, [path, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const reload = useCallback(async () => {
    try {
      const payload = await getJson<T>(path);
      if (active.current) setState({ status: 'ready', payload, refreshing: false });
    } catch (cause) {
      if (active.current) setState({ status: 'error', notFound: isNotFound(cause) });
    }
  }, [path]);

  if (state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error', retry, notFound: state.notFound };
  return { ...state, reload };
}

const isNotFound = (cause: unknown) => cause instanceof ApiError && cause.status === 404;

/** Chave de idempotência nova para cada intenção de escrita. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Mensagem pública devolvida pelo backend, ou uma genérica sem detalhe interno. */
export function errorMessage(cause: unknown, fallback = 'Não foi possível salvar. Nada foi alterado. Tente novamente.'): string {
  return cause instanceof ApiError && cause.publicMessage ? cause.publicMessage : fallback;
}

/** Valor monetário em linha: símbolo mais leve que o número (R-24). */
export function Money({ cents, sign = false, className = '' }: { cents: string; sign?: boolean; className?: string }) {
  const money = formatCents(cents);
  const prefix = sign && !money.negative && BigInt(cents) > 0n ? '+' : '';
  return (
    <span className={`money ${money.negative ? 'figure-negative' : ''} ${className}`.trim()}>
      <span className="money-symbol">{money.symbol}</span> {prefix}
      {money.value}
    </span>
  );
}

/** Figura de destaque de um cartão de resumo. */
export function Figure({ cents, hero = false }: { cents: string; hero?: boolean }) {
  const money = formatCents(cents);
  return (
    <p className={hero ? 'figure figure-hero' : 'figure'}>
      <span className="figure-symbol">{money.symbol}</span>
      <span className={money.negative ? 'figure-value figure-negative' : 'figure-value'}>{money.value}</span>
    </p>
  );
}

export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="stack-lg" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <section className="card card-lg">
        <span className="skeleton skeleton-eyebrow" />
        <span className="skeleton skeleton-hero" />
        <span className="skeleton skeleton-line" />
      </section>
      <section className="card">
        {Array.from({ length: rows }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: linhas de esqueleto sem identidade
          <span key={index} className="skeleton skeleton-line" />
        ))}
      </section>
    </div>
  );
}

export function QueryError({ retry, subject }: { retry: () => void; subject: string }) {
  return (
    <section className="card card-lg empty error-state" role="alert">
      <StateArt name="falha-consulta" />
      <h2 className="h-display">Não foi possível consultar {subject}</h2>
      <p className="muted">Nada foi alterado. Nenhum valor aparece enquanto a consulta não responder.</p>
      <button type="button" className="btn btn-neutral" onClick={retry}>
        <i className="bi bi-arrow-clockwise" aria-hidden="true" />
        Tentar novamente
      </button>
    </section>
  );
}

export function EmptyState({ art, title, text, children }: { art: StateArtName; title: string; text: string; children?: ReactNode }) {
  return (
    <section className="card card-lg empty">
      <StateArt name={art} />
      <h2 className="h-display">{title}</h2>
      <p className="muted">{text}</p>
      {children}
    </section>
  );
}

/** Aviso fixo: estas telas fazem contas, não recomendam. */
export function EducationNotice({ children }: { children: ReactNode }) {
  return (
    <aside className="callout callout-info planning-notice">
      <i className="bi bi-info-circle" aria-hidden="true" />
      <p className="small">{children}</p>
    </aside>
  );
}

/** Erro de formulário perto do campo, anunciado ao leitor de tela. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="callout callout-err small" role="alert">
      <i className="bi bi-exclamation-octagon" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

/** "novembro de 2026" a partir de `2026-11`. */
export function formatMonth(month: string, withYear = true): string {
  const [year, index] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', withYear ? { month: 'long', year: 'numeric' } : { month: 'long' }).format(new Date(year, index - 1, 1));
}

/** "20 de novembro de 2026" a partir de ISO, com o ano sempre explícito. */
export function formatFullDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

/** Data local em `AAAA-MM-DD`, para campos de data. Não passa por UTC. */
export function dateInput(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

/** Hoje em `AAAA-MM-DD`, para o valor inicial de campos de data. */
export function todayInput(): string {
  return dateInput(new Date());
}

/** Barra de progresso acessível: o número vem em texto ao lado, nunca só na barra. */
export function ProgressBar({ bps, label, tone = 'data' }: { bps: number; label: string; tone?: 'data' | 'over' | 'done' }) {
  const percent = Math.max(0, Math.min(100, bps / 100));
  return (
    <span
      className={`progress progress-${tone}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <span className="progress-fill" style={{ width: `${percent}%` }} />
    </span>
  );
}

export const plural = (total: number, one: string, many: string) => `${total} ${total === 1 ? one : many}`;
