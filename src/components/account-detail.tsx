'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, callApi, deleteJson, getJson, postJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';
import {
  ACCOUNT_TYPE_LABELS,
  PIX_TYPE_LABELS,
  useAccountDetail,
  type AccountDetail,
} from '@/hooks/use-accounts';

/* Detalhe de uma conta.

   Feature 2 de docs/ROUTING_MVP.md: editar, desativar, informar saldo e
   cadastrar chaves PIX próprias.

   A chave PIX aparece sempre mascarada. Ver o valor em claro é ação explícita,
   e o valor não é guardado no estado depois de fechado
   (docs/ONBOARDING.md, Bloco 3). */

function shortDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Money({ cents }: { cents: string }) {
  const money = formatCents(cents);
  return (
    <span className={money.negative ? 'num figure-negative' : 'num'}>
      {money.symbol} {money.value}
    </span>
  );
}

/** Converte o valor digitado em centavos inteiros, sem passar por float. */
function toCents(raw: string): string | null {
  const cleaned = raw.trim().replace(/[^\d,.-]/g, '');
  if (cleaned.length === 0) return null;
  const negative = cleaned.startsWith('-');
  const digits = cleaned.replace(/-/g, '');
  const separator = Math.max(digits.lastIndexOf(','), digits.lastIndexOf('.'));
  const units = (separator === -1 ? digits : digits.slice(0, separator)).replace(/[.,]/g, '') || '0';
  const fraction = separator === -1 ? '' : digits.slice(separator + 1).replace(/[.,]/g, '');
  const cents = `${units}${fraction.slice(0, 2).padEnd(2, '0')}`;
  if (!/^\d+$/.test(cents)) return null;
  return `${negative ? '-' : ''}${BigInt(cents).toString()}`;
}

function BalanceForm({ accountId, onSaved }: { accountId: string; onSaved: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const balanceCents = toCents(value);
    if (balanceCents === null) {
      setError('Informe um valor válido.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/accounts/${encodeURIComponent(accountId)}/balance-snapshots`, { balanceCents });
      setValue('');
      onSaved();
    } catch {
      setError('O saldo não pôde ser gravado.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="field-row">
        <label className="field">
          Saldo conhecido hoje
          <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" inputMode="decimal" />
        </label>
      </div>
      {error && <p className="small figure-negative">{error}</p>}
      <button type="button" className="btn btn-neutral" disabled={busy} onClick={submit}>
        {busy ? 'Gravando…' : 'Registrar saldo'}
      </button>
      <p className="small muted">
        Cada saldo é um fato datado. O painel soma o mais recente com os lançamentos posteriores a
        ele, então registrar um novo não apaga o anterior.
      </p>
    </div>
  );
}

function PixSection({ account, onChanged }: { account: AccountDetail; onChanged: () => void }) {
  const [type, setType] = useState('cpf');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; value: string } | null>(null);

  const add = async () => {
    if (value.trim().length === 0) {
      setError('Informe a chave.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/accounts/${encodeURIComponent(account.id)}/pix-identifiers`, {
        type,
        value: value.trim(),
        ...(label.trim().length > 0 ? { label: label.trim() } : {}),
      });
      setValue('');
      setLabel('');
      onChanged();
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.publicMessage
          ? caught.publicMessage
          : 'A chave não pôde ser cadastrada.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (id: string) => {
    if (revealed?.id === id) {
      setRevealed(null);
      return;
    }
    try {
      const payload = await getJson<{ pixIdentifier: { value: string | null } }>(
        `/api/accounts/${encodeURIComponent(account.id)}/pix-identifiers/${encodeURIComponent(id)}?reveal=1`,
      );
      if (payload.pixIdentifier.value) setRevealed({ id, value: payload.pixIdentifier.value });
    } catch {
      setError('A chave não pôde ser lida.');
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await callApi('PATCH', `/api/accounts/${encodeURIComponent(account.id)}/pix-identifiers/${encodeURIComponent(id)}`, {
      json: { isActive },
    });
    onChanged();
  };

  const remove = async (id: string) => {
    await deleteJson(`/api/accounts/${encodeURIComponent(account.id)}/pix-identifiers/${encodeURIComponent(id)}`);
    setRevealed(null);
    onChanged();
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="h-display">Chaves PIX desta conta</h2>
        <span className="small muted">Servem só para reconhecer transferências entre suas contas.</span>
      </div>

      <div className="callout callout-info">
        <i className="bi bi-shield-lock" aria-hidden="true" />
        <p className="small">
          A chave é cifrada e salva somente neste dispositivo. Ela não é enviada à nuvem e não
          aparece em nenhum registro do sistema.
        </p>
      </div>

      {account.pixIdentifiers.length > 0 && (
        <table className="tbl tbl-data">
          <caption className="sr-only">Chaves PIX cadastradas nesta conta.</caption>
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Chave</th>
              <th scope="col">Situação</th>
              <th scope="col" className="right">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {account.pixIdentifiers.map((identifier) => (
              <tr key={identifier.id}>
                <td className="small">{PIX_TYPE_LABELS[identifier.type] ?? identifier.type}</td>
                <td>
                  <span className="num">
                    {revealed?.id === identifier.id ? revealed.value : identifier.maskedValue}
                  </span>
                  {identifier.label && <span className="small muted"> · {identifier.label}</span>}
                </td>
                <td className="small">
                  {identifier.isActive ? (
                    'Ativa'
                  ) : (
                    <span className="muted">Inativa</span>
                  )}
                </td>
                <td className="right">
                  <button type="button" className="btn-link" onClick={() => void reveal(identifier.id)}>
                    {revealed?.id === identifier.id ? 'Ocultar' : 'Ver'}
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => void toggleActive(identifier.id, !identifier.isActive)}
                  >
                    {identifier.isActive ? 'Desativar' : 'Reativar'}
                  </button>
                  <button type="button" className="btn-link" onClick={() => void remove(identifier.id)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="field-row">
        <label className="field">
          Tipo
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {Object.entries(PIX_TYPE_LABELS).map(([option, optionLabel]) => (
              <option key={option} value={option}>
                {optionLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Chave
          <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Somente sua própria chave" />
        </label>
        <label className="field">
          Apelido (opcional)
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Chave principal" />
        </label>
      </div>

      {error && <p className="small figure-negative">{error}</p>}

      <button type="button" className="btn btn-neutral" disabled={busy} onClick={add}>
        {busy ? 'Cadastrando…' : 'Cadastrar chave'}
      </button>
    </section>
  );
}

export function AccountDetailPage({ accountId }: { accountId: string }) {
  const router = useRouter();
  const state = useAccountDetail(accountId);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <section className="card" aria-busy="true">
        <span className="skeleton skeleton-eyebrow" />
        <span className="skeleton skeleton-metric" />
        <span className="skeleton skeleton-line" />
      </section>
    );
  }

  if (state.status === 'missing') {
    return (
      <section className="card card-lg empty">
        <i className="bi bi-bank" aria-hidden="true" />
        <h2 className="h-display">Conta não encontrada</h2>
        <Link className="btn btn-neutral" href="/contas">
          Voltar às contas
        </Link>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="card card-lg error-state" role="alert">
        <p className="eyebrow">Conta indisponível</p>
        <h2 className="h-display">Não foi possível consultar o banco local</h2>
        <Link className="btn btn-neutral" href="/contas">
          Voltar às contas
        </Link>
      </section>
    );
  }

  const { account, reload } = state;

  const setActive = async (isActive: boolean) => {
    setWorking(true);
    setActionError(null);
    try {
      await callApi('PATCH', `/api/accounts/${encodeURIComponent(account.id)}`, { json: { isActive } });
      reload();
    } catch {
      setActionError('A conta não pôde ser atualizada.');
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    setWorking(true);
    setActionError(null);
    try {
      await deleteJson(`/api/accounts/${encodeURIComponent(account.id)}`);
      router.push('/contas');
      router.refresh();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError && caught.publicMessage
          ? caught.publicMessage
          : 'A conta não pôde ser excluída.',
      );
      setWorking(false);
    }
  };

  const hasHistory = account.transactionCount > 0 || account.importBatchCount > 0;

  return (
    <div className="stack-lg">
      <section className="card card-lg">
        <p className="eyebrow">
          {account.institution?.name ?? 'Sem instituição'} ·{' '}
          {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
        </p>
        <h2 className="h-display-lg">{account.name}</h2>

        {!account.isActive && (
          <p className="callout callout-warn">
            <i className="bi bi-pause-circle" aria-hidden="true" />
            <span className="small">
              Conta desativada. Ela fica fora dos totais do painel, e o histórico continua
              preservado.
            </span>
          </p>
        )}

        <dl className="spec-grid">
          <div>
            <dt>Saldo conhecido</dt>
            <dd>
              {account.balanceCents === null ? (
                <span className="small muted">Não informado</span>
              ) : (
                <Money cents={account.balanceCents} />
              )}
            </dd>
          </div>
          <div>
            <dt>Data do saldo</dt>
            <dd className="num">{shortDate(account.balanceCapturedAt)}</dd>
          </div>
          <div>
            <dt>Lançamentos</dt>
            <dd className="num">{account.transactionCount}</dd>
          </div>
          <div>
            <dt>Moeda</dt>
            <dd className="num">{account.currency}</dd>
          </div>
        </dl>

        {actionError && <p className="small figure-negative">{actionError}</p>}

        <div className="row-tight">
          <Link className="btn btn-neutral" href={`/extratos?conta=${account.id}`}>
            Ver lançamentos
          </Link>
          <button
            type="button"
            className="btn btn-neutral"
            disabled={working}
            onClick={() => void setActive(!account.isActive)}
          >
            {account.isActive ? 'Desativar conta' : 'Reativar conta'}
          </button>
          {!hasHistory && (
            <button type="button" className="btn btn-danger" disabled={working} onClick={() => void remove()}>
              Excluir conta
            </button>
          )}
        </div>

        {hasHistory && (
          <p className="small muted">
            Esta conta tem histórico importado e por isso não pode ser excluída. Desativá-la tira a
            conta dos totais sem apagar nenhum lançamento.
          </p>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="h-display">Saldos informados</h2>
        </div>
        <BalanceForm accountId={account.id} onSaved={reload} />

        {account.balanceHistory.length > 0 && (
          <table className="tbl tbl-data">
            <caption className="sr-only">Histórico de saldos conhecidos desta conta.</caption>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Origem</th>
                <th scope="col" className="right">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>
              {account.balanceHistory.map((snapshot) => (
                <tr key={snapshot.id}>
                  <td className="num">{shortDate(snapshot.capturedAt)}</td>
                  <td className="small muted">{snapshot.fromImport ? 'Extrato importado' : 'Informado'}</td>
                  <td className="right">
                    <Money cents={snapshot.balanceCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <PixSection account={account} onChanged={reload} />
    </div>
  );
}
