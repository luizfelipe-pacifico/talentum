'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { postJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';
import { useImport, type ColumnRole, type InspectionPayload } from '@/hooks/use-import';

/* Assistente de importação de extrato.

   Feature 4 de docs/ROUTING_MVP.md. O fluxo é: escolher o arquivo, conferir a
   leitura, escolher a conta de destino e confirmar. Nada é gravado antes da
   confirmação, e o que a tela mostra vem sempre do backend — o navegador não
   analisa o extrato. */

const ROLE_LABELS: Record<ColumnRole, string> = {
  date: 'Data',
  description: 'Descrição',
  amount: 'Valor',
  debitAmount: 'Valor de débito',
  creditAmount: 'Valor de crédito',
  direction: 'Tipo (débito/crédito)',
  externalId: 'Identificador',
  balance: 'Saldo',
  document: 'Documento',
  ignore: 'Ignorar',
};

const ROLE_ORDER: ColumnRole[] = [
  'date',
  'description',
  'amount',
  'debitAmount',
  'creditAmount',
  'direction',
  'externalId',
  'balance',
  'document',
  'ignore',
];

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Conta corrente' },
  { value: 'payment', label: 'Conta de pagamento' },
  { value: 'savings', label: 'Poupança' },
  { value: 'brokerage', label: 'Corretora' },
  { value: 'wallet', label: 'Carteira digital' },
  { value: 'cash', label: 'Dinheiro' },
];

function shortDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Amount({ cents }: { cents: string }) {
  const money = formatCents(cents);
  return (
    <span className={money.negative ? 'num figure-negative' : 'num'}>
      {money.symbol} {money.value}
    </span>
  );
}

/** Escolha do arquivo. Aceita clique e arrastar-e-soltar. */
function FilePicker({ onPick, busy }: { onPick: (file: File) => void; busy: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <section className="card card-lg">
      <p className="eyebrow">Importar extrato</p>
      <h2 className="h-display-lg">Escolha o arquivo do seu banco</h2>
      <p className="muted">
        Aceita CSV e OFX. O arquivo é lido no seu dispositivo pelo backend local e não é enviado à
        nuvem. Nada é gravado antes de você conferir a leitura.
      </p>

      <div
        className={dragging ? 'dropzone dropzone-active' : 'dropzone'}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) onPick(dropped);
        }}
      >
        <i className="bi bi-file-earmark-arrow-up" aria-hidden="true" />
        <p className="muted">Arraste o arquivo para cá ou escolha no computador.</p>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".csv,.ofx,.txt,text/csv,text/plain,application/x-ofx"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) onPick(chosen);
          }}
        />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Lendo o arquivo…' : 'Escolher arquivo'}
        </button>
      </div>

      <div className="callout callout-info">
        <i className="bi bi-shield-lock" aria-hidden="true" />
        <p className="small">
          O conteúdo do extrato não é armazenado. O sistema guarda apenas os lançamentos, o período
          coberto e os metadados do arquivo.
        </p>
      </div>
    </section>
  );
}

/** Criação rápida da conta de destino, quando ainda não existe nenhuma. */
function NewAccountForm({ onCreated }: { onCreated: (accountId: string) => void }) {
  const [name, setName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [type, setType] = useState('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length === 0) {
      setError('Dê um apelido para a conta.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await postJson<{ account: { id: string } }>('/api/accounts', {
        name: name.trim(),
        type,
        ...(institutionName.trim().length > 0 ? { institutionName: institutionName.trim() } : {}),
      });
      onCreated(payload.account.id);
    } catch {
      setError('A conta não pôde ser criada.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <p className="small muted">
        Nenhuma agência, número de conta ou senha é solicitada — apenas um apelido para você
        reconhecer a conta.
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
      </div>
      {error && <p className="small figure-negative">{error}</p>}
      <button type="button" className="btn btn-neutral" disabled={busy} onClick={submit}>
        {busy ? 'Criando…' : 'Criar conta'}
      </button>
    </div>
  );
}

function Review({
  inspection,
  onConfirm,
  onRemap,
  onCancel,
  committing,
}: {
  inspection: InspectionPayload;
  onConfirm: (accountId: string, roles: ColumnRole[] | null) => void;
  onRemap: (roles: ColumnRole[]) => void;
  onCancel: () => void;
  committing: boolean;
}) {
  const [roles, setRoles] = useState<ColumnRole[]>(inspection.mapping?.roles ?? []);
  const [accountId, setAccountId] = useState(inspection.accounts[0]?.id ?? '');
  const [creatingAccount, setCreatingAccount] = useState(inspection.accounts.length === 0);

  useEffect(() => {
    setRoles(inspection.mapping?.roles ?? []);
    if (inspection.accounts.length > 0 && accountId === '') setAccountId(inspection.accounts[0].id);
  }, [inspection, accountId]);

  const changeRole = useCallback(
    (column: number, role: ColumnRole) => {
      const next = [...roles];
      next[column] = role;
      setRoles(next);
      onRemap(next);
    },
    [roles, onRemap],
  );

  const blocked = inspection.alreadyImported !== null;

  return (
    <div className="stack-lg">
      <section className="card card-lg">
        <p className="eyebrow">Conferência · passo 2 de 2</p>
        <h2 className="h-display-lg">
          {inspection.rowCount} {inspection.rowCount === 1 ? 'lançamento lido' : 'lançamentos lidos'}
        </h2>
        <p className="muted">
          Período de {shortDate(inspection.periodStart)} a {shortDate(inspection.periodEnd)} · formato{' '}
          {inspection.format.toUpperCase()} · codificação {inspection.encoding}
        </p>

        <dl className="spec-grid">
          <div>
            <dt>Lançamentos</dt>
            <dd className="num">{inspection.rowCount}</dd>
          </div>
          <div>
            <dt>Linhas com problema</dt>
            <dd className="num">{inspection.issueCount}</dd>
          </div>
          <div>
            <dt>Saldo final do extrato</dt>
            <dd>{inspection.closingBalanceCents ? <Amount cents={inspection.closingBalanceCents} /> : '—'}</dd>
          </div>
        </dl>

        {inspection.repairedEncoding && (
          <p className="callout callout-info">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <span className="small">
              O arquivo tinha caracteres corrompidos na origem e as descrições foram corrigidas na
              leitura.
            </span>
          </p>
        )}

        {blocked && (
          <p className="callout callout-warn">
            <i className="bi bi-exclamation-triangle" aria-hidden="true" />
            <span className="small">
              Este mesmo arquivo já foi importado em {shortDate(inspection.alreadyImported!.importedAt)}.
              Importar de novo não duplicaria os lançamentos, mas também não acrescentaria nada.
            </span>
          </p>
        )}
      </section>

      {inspection.format === 'csv' && inspection.headers && (
        <section className="card">
          <div className="card-header">
            <h2 className="h-display">Colunas reconhecidas</h2>
            <span className="small muted">Ajuste se alguma coluna estiver com o papel errado.</span>
          </div>
          <div className="mapping-grid">
            {inspection.headers.map((header, column) => (
              <label key={`${header}-${column}`} className="field">
                <span className="mapping-header">{header || `Coluna ${column + 1}`}</span>
                <select
                  value={roles[column] ?? 'ignore'}
                  onChange={(event) => changeRole(column, event.target.value as ColumnRole)}
                >
                  {ROLE_ORDER.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="h-display">Prévia</h2>
          <span className="small muted">Amostra dos primeiros lançamentos, ainda não gravados.</span>
        </div>
        <table className="tbl tbl-data">
          <caption className="sr-only">Amostra dos lançamentos lidos do arquivo.</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Descrição</th>
              <th scope="col" className="right">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {inspection.preview.map((row) => (
              <tr key={row.lineNumber}>
                <td className="num">{shortDate(row.occurredOn)}</td>
                <td>{row.description}</td>
                <td className="right">
                  <Amount cents={row.amountCents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {inspection.issues.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="h-display">Linhas que não puderam ser lidas</h2>
            <span className="small muted">Elas não serão importadas, e ficam registradas no lote.</span>
          </div>
          <table className="tbl tbl-data">
            <thead>
              <tr>
                <th scope="col">Linha</th>
                <th scope="col">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {inspection.issues.map((issue) => (
                <tr key={`${issue.lineNumber}-${issue.code}`}>
                  <td className="num">{issue.lineNumber}</td>
                  <td>{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="h-display">Conta de destino</h2>
        </div>

        {creatingAccount ? (
          <NewAccountForm
            onCreated={(id) => {
              setAccountId(id);
              setCreatingAccount(false);
              // A lista de contas vem da inspeção; reinspecionar traz a nova.
              onRemap(roles);
            }}
          />
        ) : (
          <div className="stack">
            <label className="field">
              Conta
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                {inspection.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.institutionName ? `${account.institutionName} · ${account.name}` : account.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-link" onClick={() => setCreatingAccount(true)}>
              Cadastrar outra conta
              <i className="bi bi-arrow-right-short" aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      <div className="row-tight">
        <button
          type="button"
          className="btn btn-primary"
          disabled={committing || blocked || accountId === '' || inspection.rowCount === 0}
          onClick={() => onConfirm(accountId, roles.length > 0 ? roles : null)}
        >
          {committing ? 'Gravando…' : `Importar ${inspection.rowCount} lançamentos`}
        </button>
        <button type="button" className="btn btn-neutral" onClick={onCancel} disabled={committing}>
          Escolher outro arquivo
        </button>
      </div>
    </div>
  );
}

export function ImportWizard() {
  const { stage, file, inspect, commit, createProfile, reset } = useImport();

  const remap = useCallback(
    (roles: ColumnRole[]) => {
      if (file) void inspect(file, { roles });
    },
    [file, inspect],
  );

  if (stage.status === 'noProfile') {
    return (
      <section className="card card-lg empty">
        <i className="bi bi-person-plus" aria-hidden="true" />
        <h2 className="h-display">Crie seu perfil local primeiro</h2>
        <p className="muted">
          O perfil é o escopo de tudo que fica salvo neste dispositivo. Ele não é enviado a lugar
          nenhum.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => void createProfile()}>
          Criar perfil local
        </button>
      </section>
    );
  }

  if (stage.status === 'done') {
    const { result } = stage;
    return (
      <section className="card card-lg">
        <p className="eyebrow">Importação concluída</p>
        <h2 className="h-display-lg">
          {result.importedCount} {result.importedCount === 1 ? 'lançamento gravado' : 'lançamentos gravados'}
        </h2>
        <dl className="spec-grid">
          <div>
            <dt>Lidos do arquivo</dt>
            <dd className="num">{result.rowCount}</dd>
          </div>
          <div>
            <dt>Já existiam</dt>
            <dd className="num">{result.duplicateCount}</dd>
          </div>
          <div>
            <dt>Período coberto</dt>
            <dd className="num">
              {shortDate(result.periodStart)} – {shortDate(result.periodEnd)}
            </dd>
          </div>
        </dl>
        {result.balanceRecorded && (
          <p className="callout callout-ok">
            <i className="bi bi-check2-circle" aria-hidden="true" />
            <span className="small">O saldo final do extrato foi registrado como saldo conhecido da conta.</span>
          </p>
        )}
        <div className="row-tight">
          <Link className="btn btn-primary" href="/dashboard">
            Ver o painel
          </Link>
          <Link className="btn btn-neutral" href="/extratos">
            Ver os lançamentos
          </Link>
          <button type="button" className="btn btn-neutral" onClick={reset}>
            Importar outro arquivo
          </button>
        </div>
      </section>
    );
  }

  if (stage.status === 'error') {
    return (
      <section className="card card-lg error-state" role="alert">
        <p className="eyebrow">Importação interrompida</p>
        <h2 className="h-display">{stage.message}</h2>
        <p className="muted">Nenhum lançamento foi gravado. Confira o arquivo e tente novamente.</p>
        <button type="button" className="btn btn-neutral" onClick={reset}>
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
          Escolher outro arquivo
        </button>
      </section>
    );
  }

  if (stage.status === 'review' || stage.status === 'committing') {
    return (
      <Review
        inspection={stage.inspection}
        committing={stage.status === 'committing'}
        onConfirm={(accountId, roles) => void commit(accountId, roles)}
        onRemap={remap}
        onCancel={reset}
      />
    );
  }

  return <FilePicker busy={stage.status === 'inspecting'} onPick={(chosen) => void inspect(chosen)} />;
}
