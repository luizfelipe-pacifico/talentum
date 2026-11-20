'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ApiError, postJson } from '@/lib/api-client';
import { formatCents, formatDay } from '@/lib/format';
import { StateArt } from '@/components/state-art';
import { useAccounts } from '@/hooks/use-accounts';
import { toCents, useCards, type CardListRow } from '@/hooks/use-cards';

/* Cartões de crédito (Stage 8, docs/PRODUCT.md).

   A lista mostra, por cartão, o que a pessoa precisa decidir: quanto falta pagar
   da próxima fatura e quando vence. Nenhum número de cartão é pedido; só um
   apelido e, se a pessoa quiser, os quatro últimos dígitos. */

/* ── Peças compartilhadas pelas telas de cartão ────────────────── */

export function Money({ cents, className }: { cents: string; className?: string }) {
  const money = formatCents(cents);
  return (
    <span className={`num${money.negative ? ' figure-negative' : ''}${className ? ` ${className}` : ''}`}>
      {money.symbol} {money.value}
    </span>
  );
}

export function shortDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function LoadingCard({ label }: { label: string }) {
  return (
    <section className="card" aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <span className="skeleton skeleton-eyebrow" />
      {[0, 1, 2].map((index) => (
        <span key={index} className="skeleton skeleton-line" />
      ))}
    </section>
  );
}

export function QueryError({ what, retry }: { what: string; retry: () => void }) {
  return (
    <section className="card card-lg empty error-state" role="alert">
      <StateArt name="falha-consulta" />
      <h2 className="h-display">Não foi possível consultar o banco local</h2>
      <p className="muted">Nenhum dado de {what} é exibido enquanto a consulta não responder.</p>
      <button type="button" className="btn btn-neutral" onClick={retry}>
        <i className="bi bi-arrow-clockwise" aria-hidden="true" />
        Tentar novamente
      </button>
    </section>
  );
}

/** Mensagem pública do backend, ou a mensagem da tela quando não houver uma. */
export function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError && error.publicMessage ? error.publicMessage : fallback;
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className="small figure-negative" role="alert">
      {children}
    </p>
  );
}

/** Dia do mês digitado (1 a 31), ou `null` vazio. `undefined` quando inválido. */
function toDay(raw: string): number | null | undefined {
  if (raw.trim().length === 0) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 31 ? value : undefined;
}

/* ── Lista ─────────────────────────────────────────────────────── */

function CardTile({ card }: { card: CardListRow }) {
  const open = card.openStatement;
  const subtitle = [card.institution?.name, card.lastFourDigits ? `final ${card.lastFourDigits}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <li>
      <Link className="card card-sm card-tile" href={`/extratos/cartoes/${card.id}`}>
        <span className="row-between">
          <strong>{card.name}</strong>
          <i className="bi bi-chevron-right muted" aria-hidden="true" />
        </span>
        {subtitle && <span className="small muted">{subtitle}</span>}
        {open ? (
          <span className="stack-tight">
            <span className="small muted">Falta pagar da fatura que vence em {formatDay(open.dueDate)}</span>
            <Money cents={open.outstandingCents} className="metric" />
            {open.isEstimated && <span className="chip chip-warn">Valor estimado</span>}
          </span>
        ) : (
          <span className="small muted">
            Nenhuma fatura em aberto. Próximo vencimento: {formatDay(card.nextCycle.dueDate)}.
          </span>
        )}
        {card.limitCents && (
          <span className="small muted">
            Limite <Money cents={card.limitCents} />
          </span>
        )}
      </Link>
    </li>
  );
}

export function CardsPage() {
  const state = useCards();
  const [creating, setCreating] = useState(false);

  if (state.status === 'loading') return <LoadingCard label="Consultando os cartões." />;
  if (state.status === 'error') return <QueryError what="cartão" retry={state.retry} />;
  if (state.status === 'missing') return <QueryError what="cartão" retry={() => window.location.reload()} />;

  const { cards, hasProfile } = state.data;

  if (!hasProfile) {
    return (
      <section className="card card-lg empty">
        <StateArt name="sem-cartoes" />
        <h2 className="h-display">Configure o perfil antes dos cartões</h2>
        <p className="muted">Os cartões pertencem ao perfil local, criado no onboarding.</p>
        <Link className="btn btn-primary" href="/onboarding">
          Configurar perfil
        </Link>
      </section>
    );
  }

  const active = cards.filter((card) => card.isActive);
  const inactive = cards.filter((card) => !card.isActive);

  if (cards.length === 0 && !creating) {
    return (
      <section className="card card-lg empty">
        <StateArt name="sem-cartoes" />
        <h2 className="h-display">Nenhum cartão cadastrado</h2>
        <p className="muted">
          Cadastre um cartão para acompanhar faturas, vencimentos e benefícios. Bastam um apelido e o dia
          de vencimento; o número do cartão nunca é pedido.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Cadastrar cartão
        </button>
      </section>
    );
  }

  return (
    <div className="stack-lg">
      {creating ? (
        <NewCardForm onCancel={() => setCreating(false)} />
      ) : (
        <div className="row-between">
          <h2 className="h-display">
            {active.length} {active.length === 1 ? 'cartão ativo' : 'cartões ativos'}
          </h2>
          <div className="row-tight">
            <Link className="btn btn-sm btn-neutral" href="/conciliacao/faturas">
              <i className="bi bi-check2-square" aria-hidden="true" />
              Conferir faturas
            </Link>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
              <i className="bi bi-plus-lg" aria-hidden="true" />
              Cadastrar cartão
            </button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <ul className="card-tiles">
          {active.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </ul>
      )}

      {inactive.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="h-display">Cartões desativados</h2>
            <span className="small muted">As faturas ficam gravadas; as que estiverem em aberto seguem no Saldo Livre de Risco até serem pagas ou canceladas.</span>
          </div>
          <ul className="entity-list">
            {inactive.map((card) => (
              <li key={card.id}>
                <Link href={`/extratos/cartoes/${card.id}`}>{card.name}</Link>
                <span className="small muted">
                  {card.statementCount} {card.statementCount === 1 ? 'fatura' : 'faturas'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ── Cadastro ──────────────────────────────────────────────────── */

export type CardFormValues = {
  name: string;
  institutionName: string;
  lastFourDigits: string;
  closingDay: string;
  dueDay: string;
  paymentAccountId: string;
  limit: string;
  annualFee: string;
  waiverSpend: string;
  waiverPeriod: '' | 'statement' | 'year';
};

/** Valida os campos e monta o corpo da requisição, ou devolve a mensagem de erro. */
export function cardPayload(values: CardFormValues): { body: Record<string, unknown> } | { error: string } {
  if (values.name.trim().length === 0) return { error: 'Dê um apelido para o cartão.' };
  const dueDay = toDay(values.dueDay);
  if (dueDay === null || dueDay === undefined) return { error: 'Informe o dia do vencimento, de 1 a 31.' };
  const closingDay = toDay(values.closingDay);
  if (closingDay === undefined) return { error: 'O dia do fechamento vai de 1 a 31.' };
  if (values.lastFourDigits.trim().length > 0 && !/^\d{4}$/.test(values.lastFourDigits.trim())) {
    return { error: 'Os últimos dígitos são exatamente quatro números.' };
  }

  const money = (raw: string, label: string): string | null | { error: string } => {
    if (raw.trim().length === 0) return null;
    const cents = toCents(raw);
    return cents === null ? { error: `${label} não é um valor válido.` } : cents;
  };
  const limitCents = money(values.limit, 'O limite');
  const annualFeeCents = money(values.annualFee, 'A anuidade');
  const waiverCents = money(values.waiverSpend, 'O gasto para isenção');
  for (const value of [limitCents, annualFeeCents, waiverCents]) {
    if (value && typeof value === 'object') return value;
  }
  if ((waiverCents === null) !== (values.waiverPeriod === '')) {
    return { error: 'Para a isenção da anuidade, informe o gasto e se ele vale por fatura ou por ano.' };
  }

  return {
    body: {
      name: values.name.trim(),
      lastFourDigits: values.lastFourDigits.trim() || null,
      closingDay,
      dueDay,
      paymentAccountId: values.paymentAccountId || null,
      limitCents,
      annualFeeCents,
      feeWaiverSpendCents: waiverCents,
      feeWaiverPeriod: values.waiverPeriod || null,
    },
  };
}

export function CardFields({
  values,
  onChange,
  withInstitution,
}: {
  values: CardFormValues;
  onChange: (next: CardFormValues) => void;
  withInstitution: boolean;
}) {
  const accounts = useAccounts();
  const set = (key: keyof CardFormValues) => (event: { target: { value: string } }) =>
    onChange({ ...values, [key]: event.target.value });
  const accountOptions =
    accounts.status === 'ready' && accounts.payload.hasProfile
      ? accounts.payload.accounts.filter((account) => account.isActive)
      : [];

  return (
    <div className="stack">
      <div className="field-row">
        <label className="field">
          Apelido do cartão
          <input value={values.name} onChange={set('name')} maxLength={60} autoComplete="off" />
        </label>
        {withInstitution && (
          <label className="field">
            Banco emissor (opcional)
            <input value={values.institutionName} onChange={set('institutionName')} maxLength={120} />
          </label>
        )}
        <label className="field">
          Últimos quatro dígitos (opcional)
          <input
            value={values.lastFourDigits}
            onChange={set('lastFourDigits')}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          Dia do fechamento (opcional)
          <input value={values.closingDay} onChange={set('closingDay')} inputMode="numeric" maxLength={2} />
        </label>
        <label className="field">
          Dia do vencimento
          <input value={values.dueDay} onChange={set('dueDay')} inputMode="numeric" maxLength={2} />
        </label>
        <label className="field">
          Conta que paga a fatura (opcional)
          <select value={values.paymentAccountId} onChange={set('paymentAccountId')}>
            <option value="">Nenhuma conta definida</option>
            {accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          Limite (opcional)
          <input value={values.limit} onChange={set('limit')} inputMode="decimal" placeholder="R$ 0,00" />
        </label>
        <label className="field">
          Anuidade por ano (opcional)
          <input value={values.annualFee} onChange={set('annualFee')} inputMode="decimal" placeholder="R$ 0,00" />
        </label>
      </div>
      <fieldset className="fieldset-plain">
        <legend className="small">Isenção da anuidade (opcional)</legend>
        <p className="small muted">
          Se o banco isenta a anuidade a partir de um gasto mínimo, informe o valor e o período. O cartão passa a
          mostrar quanto falta gastar.
        </p>
        <div className="field-row">
          <label className="field">
            Gasto mínimo
            <input value={values.waiverSpend} onChange={set('waiverSpend')} inputMode="decimal" placeholder="R$ 0,00" />
          </label>
          <label className="field">
            Período do gasto
            <select value={values.waiverPeriod} onChange={set('waiverPeriod')}>
              <option value="">Sem regra de isenção</option>
              <option value="statement">Em cada fatura</option>
              <option value="year">No ano</option>
            </select>
          </label>
        </div>
      </fieldset>
    </div>
  );
}

export const EMPTY_CARD_FORM: CardFormValues = {
  name: '',
  institutionName: '',
  lastFourDigits: '',
  closingDay: '',
  dueDay: '',
  paymentAccountId: '',
  limit: '',
  annualFee: '',
  waiverSpend: '',
  waiverPeriod: '',
};

function NewCardForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<CardFormValues>(EMPTY_CARD_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const built = cardPayload(values);
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...built.body,
        ...(values.institutionName.trim() ? { institutionName: values.institutionName.trim() } : {}),
      };
      const payload = await postJson<{ card: { id: string } }>('/api/cards', body);
      router.push(`/extratos/cartoes/${payload.card.id}`);
    } catch (caught) {
      setError(errorText(caught, 'O cartão não pôde ser cadastrado.'));
      setBusy(false);
    }
  };

  return (
    <section className="card card-lg" aria-labelledby="novo-cartao">
      <p className="eyebrow">Novo cartão</p>
      <h2 className="h-display-lg" id="novo-cartao">
        Qual cartão você quer acompanhar?
      </h2>
      <p className="muted">
        Número completo, código de segurança e senha nunca são pedidos. O apelido serve só para você reconhecer o
        cartão.
      </p>
      <CardFields values={values} onChange={setValues} withInstitution />
      {error && <FormError>{error}</FormError>}
      <div className="row-tight">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Cadastrando…' : 'Cadastrar cartão'}
        </button>
        <button type="button" className="btn btn-neutral" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
