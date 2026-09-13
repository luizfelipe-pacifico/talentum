'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';
import { ACCOUNT_TYPE_LABELS, useAccounts, type AccountRow } from '@/hooks/use-accounts';

/* Contas do perfil local.

   Feature 2 de docs/ROUTING_MVP.md. Nenhuma agência, número de conta ou
   credencial bancária é solicitada em momento algum
   (docs/ONBOARDING.md, "Perguntas que não devem existir"). */

const ACCOUNT_TYPES = Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value, label }));

function shortDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Saldo da conta. Desconhecido é declarado, nunca renderizado como zero. */
export function AccountBalance({ account }: { account: Pick<AccountRow, 'balanceCents' | 'balanceCapturedAt'> }) {
  if (account.balanceCents === null) {
    return <span className="small muted">Saldo não informado</span>;
  }
  const money = formatCents(account.balanceCents);
  return (
    <span className={money.negative ? 'num figure-negative' : 'num'}>
      {money.symbol} {money.value}
    </span>
  );
}

function Skeleton() {
  return (
    <section className="card" aria-busy="true" aria-live="polite">
      <p className="sr-only">Consultando as contas.</p>
      <span className="skeleton skeleton-eyebrow" />
      {[0, 1, 2].map((index) => (
        <span key={index} className="skeleton skeleton-line" />
      ))}
    </section>
  );
}

export function AccountsPage() {
  const state = useAccounts();

  if (state.status === 'loading') return <Skeleton />;

  if (state.status === 'error') {
    return (
      <section className="card card-lg error-state" role="alert">
        <p className="eyebrow">Contas indisponíveis</p>
        <h2 className="h-display">Não foi possível consultar o banco local</h2>
        <p className="muted">Nenhuma conta é exibida enquanto a consulta não responder.</p>
        <button type="button" className="btn btn-neutral" onClick={state.retry}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          Tentar novamente
        </button>
      </section>
    );
  }

  if (!state.payload.hasProfile || state.payload.accounts.length === 0) {
    return (
      <section className="card card-lg empty">
        <i className="bi bi-bank" aria-hidden="true" />
        <h2 className="h-display">Nenhuma conta cadastrada</h2>
        <p className="muted">
          Cadastre onde você mantém dinheiro. Basta um apelido e o tipo — nenhuma agência, número de
          conta ou senha é solicitada.
        </p>
        <Link className="btn btn-primary" href="/contas/nova">
          Cadastrar conta
        </Link>
      </section>
    );
  }

  const { accounts } = state.payload;
  const active = accounts.filter((account) => account.isActive);
  const inactive = accounts.filter((account) => !account.isActive);
  const unknown = active.filter((account) => account.balanceCents === null).length;

  return (
    <div className="stack-lg">
      <section className="card">
        <div className="card-header">
          <h2 className="h-display">
            {active.length} {active.length === 1 ? 'conta ativa' : 'contas ativas'}
          </h2>
          <Link className="btn btn-sm btn-primary" href="/contas/nova">
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Cadastrar conta
          </Link>
        </div>

        {unknown > 0 && (
          <p className="callout callout-warn">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <span className="small">
              {unknown} {unknown === 1 ? 'conta ainda não tem' : 'contas ainda não têm'} saldo
              informado. Enquanto isso, o saldo consolidado do painel fica incompleto.
            </span>
          </p>
        )}

        <table className="tbl tbl-data">
          <caption className="sr-only">Contas cadastradas e o saldo conhecido de cada uma.</caption>
          <thead>
            <tr>
              <th scope="col">Conta</th>
              <th scope="col">Instituição</th>
              <th scope="col">Tipo</th>
              <th scope="col" className="right">
                Lançamentos
              </th>
              <th scope="col" className="right">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody>
            {active.map((account) => (
              <tr key={account.id}>
                <td>
                  <Link href={`/contas/${account.id}`}>{account.name}</Link>
                </td>
                <td className="small muted">{account.institution?.name ?? '—'}</td>
                <td className="small">{ACCOUNT_TYPE_LABELS[account.type] ?? account.type}</td>
                <td className="right num">{account.transactionCount}</td>
                <td className="right">
                  <AccountBalance account={account} />
                  {account.balanceCapturedAt && (
                    <span className="small muted"> · {shortDate(account.balanceCapturedAt)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {inactive.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="h-display">Contas desativadas</h2>
            <span className="small muted">
              Ficam fora dos totais, mas o histórico delas é preservado.
            </span>
          </div>
          <table className="tbl tbl-data">
            <tbody>
              {inactive.map((account) => (
                <tr key={account.id}>
                  <td>
                    <Link href={`/contas/${account.id}`}>{account.name}</Link>
                  </td>
                  <td className="small muted">{account.institution?.name ?? '—'}</td>
                  <td className="right num">{account.transactionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export function NewAccountPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [type, setType] = useState('checking');
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Converte o valor digitado em centavos inteiros, sem passar por float. */
  const toCents = (raw: string): string | null => {
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
  };

  const submit = async () => {
    if (name.trim().length === 0) {
      setError('Dê um apelido para a conta.');
      return;
    }
    const balanceCents = balance.trim().length > 0 ? toCents(balance) : null;
    if (balance.trim().length > 0 && balanceCents === null) {
      setError('O saldo informado não é um valor válido.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = await postJson<{ account: { id: string } }>('/api/accounts', {
        name: name.trim(),
        type,
        ...(institutionName.trim().length > 0 ? { institutionName: institutionName.trim() } : {}),
        ...(balanceCents !== null ? { balanceCents } : {}),
      });
      router.push(`/contas/${payload.account.id}`);
      router.refresh();
    } catch {
      setError('A conta não pôde ser criada.');
      setBusy(false);
    }
  };

  return (
    <section className="card card-lg">
      <p className="eyebrow">Nova conta</p>
      <h2 className="h-display-lg">Onde você mantém dinheiro?</h2>
      <p className="muted">
        Nenhuma agência, número de conta, senha ou credencial bancária é solicitada. O apelido serve
        só para você reconhecer a conta.
      </p>

      <div className="field-row">
        <label className="field">
          Apelido da conta
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Conta principal" />
        </label>
        <label className="field">
          Instituição
          <input
            value={institutionName}
            onChange={(event) => setInstitutionName(event.target.value)}
            placeholder="Nome do banco"
          />
        </label>
        <label className="field">
          Tipo
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {ACCOUNT_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Saldo atual (opcional)
          <input value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="0,00" inputMode="decimal" />
        </label>
      </div>

      <p className="small muted">
        O saldo é opcional e pode ser informado depois. Sem ele, o painel trata esta conta como
        &quot;saldo desconhecido&quot; em vez de somar zero.
      </p>

      {error && <p className="small figure-negative">{error}</p>}

      <div className="row-tight">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Criando…' : 'Criar conta'}
        </button>
        <Link className="btn btn-neutral" href="/contas">
          Cancelar
        </Link>
      </div>
    </section>
  );
}
