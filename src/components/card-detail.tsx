'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { callApi, deleteJson, postForm, postJson } from '@/lib/api-client';
import { formatDay } from '@/lib/format';
import { ConfidenceChip } from '@/components/pdf-confidence';
import { StateArt } from '@/components/state-art';
import {
  CardFields,
  cardPayload,
  errorText,
  FormError,
  LoadingCard,
  Money,
  QueryError,
  shortDate,
  type CardFormValues,
} from '@/components/cards';
import {
  BENEFIT_KIND_LABELS,
  STATUS_LABELS,
  toCents,
  toUnits,
  useCardDetail,
  useStatementDetail,
  type BenefitRow,
  type CardDetailPayload,
  type StatementSummary,
} from '@/hooks/use-cards';

/* Detalhe do cartão (Stage 8): faturas, itens, pagamento e benefícios.

   Toda escrita vai ao backend, que valida, escopa por perfil e recalcula a
   situação da fatura; a tela só recarrega e mostra o que voltou. Nenhuma
   confirmação usa diálogo do navegador: a confirmação é um segundo botão no
   próprio lugar da ação, como nos apps de banco. */

/** Data local `AAAA-MM-DD` a partir de um ISO do backend. */
function localDay(iso: string) {
  const date = new Date(iso);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function today() {
  return localDay(new Date().toISOString());
}

const negate = (cents: string) => (-BigInt(cents)).toString();

function StatusChip({ status, isEstimated }: { status: StatementSummary['status']; isEstimated?: boolean }) {
  const tone = status === 'paid' ? 'chip-ok' : status === 'cancelled' ? '' : 'chip-info';
  return (
    <span className="row-tight">
      <span className={`chip ${tone}`}>{STATUS_LABELS[status]}</span>
      {isEstimated && <span className="chip chip-warn">Valor estimado</span>}
    </span>
  );
}

/* ── Página ────────────────────────────────────────────────────── */

export function CardDetailPage({ cardId }: { cardId: string }) {
  const state = useCardDetail(cardId);
  const [selected, setSelected] = useState<string | null>(null);

  if (state.status === 'loading') return <LoadingCard label="Consultando o cartão." />;
  if (state.status === 'error') return <QueryError what="cartão" retry={state.retry} />;
  if (state.status === 'missing') {
    return (
      <section className="card card-lg empty">
        <StateArt name="sem-cartoes" />
        <h2 className="h-display">Cartão não encontrado</h2>
        <p className="muted">Este cartão não existe no banco local ou foi removido.</p>
        <Link className="btn btn-neutral" href="/extratos/cartoes">
          Ver cartões
        </Link>
      </section>
    );
  }

  const card = state.data;
  // Uma fatura excluída deixa de existir na lista: a seleção volta para a fatura em aberto.
  const stillListed = selected !== null && card.statements.some((statement) => statement.id === selected);
  const current = stillListed
    ? selected
    : (card.statements.find((statement) => statement.status === 'open')?.id ?? card.statements[0]?.id ?? null);

  return (
    <div className="stack-lg">
      <CardSummary card={card} reload={state.reload} />
      {card.feeWaiver && <FeeWaiver card={card} />}
      <Statements card={card} selected={current} onSelect={setSelected} reload={state.reload} />
      {current && <StatementPanel key={current} statementId={current} onChanged={state.reload} />}
      <Benefits card={card} reload={state.reload} />
    </div>
  );
}

/* ── Resumo e edição ───────────────────────────────────────────── */

function CardSummary({ card, reload }: { card: CardDetailPayload; reload: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtitle = [card.institution?.name, card.lastFourDigits ? `final ${card.lastFourDigits}` : null]
    .filter(Boolean)
    .join(' · ');

  const toggleActive = async () => {
    setBusy(true);
    setError(null);
    try {
      await callApi('PATCH', `/api/cards/${card.id}`, { json: { isActive: !card.isActive } });
      reload();
    } catch (caught) {
      setError(errorText(caught, 'O cartão não pôde ser alterado.'));
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteJson(`/api/cards/${card.id}`);
      router.push('/extratos/cartoes');
    } catch (caught) {
      setError(errorText(caught, 'O cartão não pôde ser excluído.'));
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  if (editing) return <EditCard card={card} onDone={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />;

  return (
    <section className="card card-lg">
      <div className="row-between">
        <div>
          <p className="eyebrow">{card.isActive ? 'Cartão ativo' : 'Cartão desativado'}</p>
          <h2 className="h-display-lg">{card.name}</h2>
          {subtitle && <p className="small muted">{subtitle}</p>}
        </div>
        <div className="row-tight">
          <button type="button" className="btn btn-sm btn-neutral" onClick={() => setEditing(true)} disabled={busy}>
            <i className="bi bi-pencil" aria-hidden="true" />
            Editar cartão
          </button>
          <button type="button" className="btn btn-sm btn-neutral" onClick={toggleActive} disabled={busy}>
            {card.isActive ? 'Desativar cartão' : 'Reativar cartão'}
          </button>
        </div>
      </div>

      <dl className="spec-grid">
        <div>
          <dt>Fechamento</dt>
          <dd>{card.closingDay ? `Dia ${card.closingDay}` : 'Não informado'}</dd>
        </div>
        <div>
          <dt>Vencimento</dt>
          <dd>Dia {card.dueDay}</dd>
        </div>
        <div>
          <dt>Próximo vencimento</dt>
          <dd>{formatDay(card.nextCycle.dueDate)}</dd>
        </div>
        <div>
          <dt>Limite</dt>
          <dd>{card.limitCents ? <Money cents={card.limitCents} /> : 'Não informado'}</dd>
        </div>
        <div>
          <dt>Anuidade</dt>
          <dd>{card.annualFeeCents ? <Money cents={card.annualFeeCents} /> : 'Não informada'}</dd>
        </div>
        <div>
          <dt>Conta que paga</dt>
          <dd>{card.paymentAccount?.name ?? 'Não definida'}</dd>
        </div>
      </dl>

      {!card.isActive && (
        <p className="callout callout-info">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span className="small">
            Cartão desativado continua com as faturas gravadas. Faturas em aberto dele seguem descontadas do Saldo
            Livre de Risco até serem pagas ou canceladas.
          </span>
        </p>
      )}

      {error && <FormError>{error}</FormError>}

      {card.statements.length === 0 && (
        <div className="row-tight">
          {confirmDelete ? (
            <>
              <button type="button" className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>
                Confirmar exclusão do cartão
              </button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirmDelete(false)}>
                Manter cartão
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirmDelete(true)}>
              <i className="bi bi-trash" aria-hidden="true" />
              Excluir cartão
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function EditCard({ card, onDone, onCancel }: { card: CardDetailPayload; onDone: () => void; onCancel: () => void }) {
  const fromCents = (value: string | null) => {
    if (!value) return '';
    const amount = BigInt(value);
    return `${amount / 100n},${(amount % 100n).toString().padStart(2, '0')}`;
  };
  const [values, setValues] = useState<CardFormValues>({
    name: card.name,
    institutionName: card.institution?.name ?? '',
    lastFourDigits: card.lastFourDigits ?? '',
    closingDay: card.closingDay ? String(card.closingDay) : '',
    dueDay: String(card.dueDay),
    paymentAccountId: card.paymentAccount?.id ?? '',
    limit: fromCents(card.limitCents),
    annualFee: fromCents(card.annualFeeCents),
    waiverSpend: fromCents(card.feeWaiver?.thresholdCents ?? null),
    waiverPeriod: card.feeWaiver?.period ?? '',
  });
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
      await callApi('PATCH', `/api/cards/${card.id}`, { json: built.body });
      onDone();
    } catch (caught) {
      setError(errorText(caught, 'O cartão não pôde ser alterado.'));
      setBusy(false);
    }
  };

  return (
    <section className="card card-lg" aria-labelledby="editar-cartao">
      <p className="eyebrow">Editar cartão</p>
      <h2 className="h-display" id="editar-cartao">
        {card.name}
      </h2>
      <CardFields values={values} onChange={setValues} withInstitution={false} />
      {error && <FormError>{error}</FormError>}
      <div className="row-tight">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar alterações'}
        </button>
        <button type="button" className="btn btn-neutral" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </section>
  );
}

/* ── Termômetro de isenção ─────────────────────────────────────── */

function FeeWaiver({ card }: { card: CardDetailPayload }) {
  const progress = card.feeWaiver;
  if (!progress) return null;
  const scope =
    progress.period === 'year'
      ? 'nas faturas que vencem este ano'
      : progress.basisDueDate
        ? `na fatura que vence em ${formatDay(progress.basisDueDate)}`
        : 'na próxima fatura';

  return (
    <section className="card" aria-labelledby="isencao">
      <div className="row-between">
        <h2 className="h-display" id="isencao">
          Isenção da anuidade
        </h2>
        {progress.met ? (
          <span className="chip chip-ok">
            <i className="bi bi-check2" aria-hidden="true" />
            Meta atingida
          </span>
        ) : (
          <span className="small muted">{progress.percent}% da meta</span>
        )}
      </div>
      <div
        className="bar bar-lg"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label="Progresso do gasto para isentar a anuidade"
      >
        <div className="bar-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="small">
        {progress.met ? (
          <>
            O gasto de <Money cents={progress.spentCents} /> {scope} já alcança o mínimo de{' '}
            <Money cents={progress.thresholdCents} />.
          </>
        ) : (
          <>
            Faltam <Money cents={progress.remainingCents} /> em compras {scope} para alcançar{' '}
            <Money cents={progress.thresholdCents} /> e isentar a anuidade.
          </>
        )}
      </p>
      <p className="small muted">
        Conta o gasto dos itens lançados; numa fatura sem itens, conta o total dela. Estornos não contam como gasto.
        Confirme a regra exata com o banco emissor.
      </p>
    </section>
  );
}

/* ── Faturas ───────────────────────────────────────────────────── */

function Statements({
  card,
  selected,
  onSelect,
  reload,
}: {
  card: CardDetailPayload;
  selected: string | null;
  onSelect: (id: string) => void;
  reload: () => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <section className="card" aria-labelledby="faturas">
      <div className="row-between">
        <h2 className="h-display" id="faturas">
          Faturas
        </h2>
        {!creating && (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Nova fatura
          </button>
        )}
      </div>

      {creating && (
        <NewStatementForm
          card={card}
          onDone={(id) => {
            setCreating(false);
            onSelect(id);
            reload();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {card.statements.length === 0 && !creating ? (
        <div className="empty">
          <StateArt name="sem-faturas" size="sm" />
          <p className="muted">
            Nenhuma fatura cadastrada. Cadastre a fatura atual para que ela seja descontada do Saldo Livre de Risco
            até o vencimento.
          </p>
        </div>
      ) : (
        <ul className="entity-list">
          {card.statements.map((statement) => (
            <li key={statement.id} className={statement.id === selected ? 'is-selected' : undefined}>
              <span>
                <strong>Vence em {shortDate(statement.dueDate)}</strong>
                <span className="small muted">
                  Fechou em {shortDate(statement.closingDate)} · {statement.itemCount}{' '}
                  {statement.itemCount === 1 ? 'item' : 'itens'}
                </span>
                <StatusChip status={statement.status} isEstimated={statement.isEstimated} />
              </span>
              <span className="stack-tight right">
                <Money cents={statement.totalCents} />
                {statement.status === 'open' && statement.paidCents !== '0' && (
                  <span className="small muted">
                    Falta <Money cents={statement.outstandingCents} />
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-quiet"
                  aria-pressed={statement.id === selected}
                  onClick={() => onSelect(statement.id)}
                >
                  {statement.id === selected ? 'Aberta abaixo' : 'Ver fatura'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewStatementForm({
  card,
  onDone,
  onCancel,
}: {
  card: CardDetailPayload;
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const [closingDate, setClosingDate] = useState(localDay(card.nextCycle.closingDate));
  const [dueDate, setDueDate] = useState(localDay(card.nextCycle.dueDate));
  const [total, setTotal] = useState('');
  const [estimated, setEstimated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const totalCents = toCents(total);
    if (totalCents === null) {
      setError('Informe o total da fatura. Se ainda não souber, informe uma estimativa e marque a opção abaixo.');
      return;
    }
    if (!closingDate || !dueDate) {
      setError('Informe as datas de fechamento e de vencimento.');
      return;
    }
    if (dueDate < closingDate) {
      setError('O vencimento precisa ser depois do fechamento.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await postJson<{ statement: { id: string } }>(`/api/cards/${card.id}/statements`, {
        closingDate,
        dueDate,
        totalCents,
        isEstimated: estimated,
      });
      onDone(payload.statement.id);
    } catch (caught) {
      setError(errorText(caught, 'A fatura não pôde ser cadastrada.'));
      setBusy(false);
    }
  };

  return (
    <div className="subform">
      {card.nextCycle.closingIsEstimated && (
        <p className="small muted">
          O dia do fechamento não foi informado; a data sugerida é uma aproximação. Ajuste pela fatura do banco.
        </p>
      )}
      <div className="field-row">
        <label className="field">
          Fechamento
          <input type="date" value={closingDate} onChange={(event) => setClosingDate(event.target.value)} />
        </label>
        <label className="field">
          Vencimento
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label className="field">
          Total da fatura
          <input value={total} onChange={(event) => setTotal(event.target.value)} inputMode="decimal" placeholder="R$ 0,00" />
        </label>
      </div>
      <label className="check-field">
        <input type="checkbox" checked={estimated} onChange={(event) => setEstimated(event.target.checked)} />
        O total é uma estimativa (a fatura ainda não fechou)
      </label>
      {error && <FormError>{error}</FormError>}
      <div className="row-tight">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Cadastrando…' : 'Cadastrar fatura'}
        </button>
        <button type="button" className="btn btn-neutral" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ── Uma fatura: itens, importação e pagamento ─────────────────── */

function StatementPanel({ statementId, onChanged }: { statementId: string; onChanged: () => void }) {
  const state = useStatementDetail(statementId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (state.status === 'loading') return <LoadingCard label="Consultando a fatura." />;
  if (state.status === 'error') return <QueryError what="fatura" retry={state.retry} />;
  if (state.status === 'missing') return null;

  const statement = state.data;
  const refresh = () => {
    state.reload();
    onChanged();
  };

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    let done = false;
    try {
      await action();
      refresh();
      done = true;
    } catch (caught) {
      setError(errorText(caught, fallback));
    }
    setBusy(false);
    return done;
  };

  const difference = BigInt(statement.itemsTotalCents) - BigInt(statement.totalCents);

  return (
    <section className="card card-lg" aria-labelledby="fatura-aberta">
      <div className="row-between">
        <div>
          <p className="eyebrow">Fatura de {statement.card.name}</p>
          <h2 className="h-display" id="fatura-aberta">
            Vence em {formatDay(statement.dueDate)}
          </h2>
        </div>
        <StatusChip status={statement.status} isEstimated={statement.isEstimated} />
      </div>

      <dl className="spec-grid">
        <div>
          <dt>Total</dt>
          <dd>
            <Money cents={statement.totalCents} />
          </dd>
        </div>
        <div>
          <dt>Pago e conciliado</dt>
          <dd>
            <Money cents={statement.paidCents} />
          </dd>
        </div>
        <div>
          <dt>Falta pagar</dt>
          <dd>
            <Money cents={statement.outstandingCents} />
          </dd>
        </div>
        <div>
          <dt>Soma dos itens</dt>
          <dd>
            <Money cents={statement.itemsTotalCents} />
          </dd>
        </div>
      </dl>

      {statement.itemCount > 0 && difference !== 0n && (
        <p className="callout callout-warn">
          <i className="bi bi-exclamation-triangle" aria-hidden="true" />
          <span className="small">
            Os itens somam <Money cents={difference < 0n ? (-difference).toString() : difference.toString()} />{' '}
            {difference < 0n ? 'a menos' : 'a mais'} que o total da fatura. Confira se falta lançar algum item ou se o
            total mudou.
          </span>
        </p>
      )}

      {error && <FormError>{error}</FormError>}

      <Payments statement={statement} busy={busy} run={run} />
      <Items statement={statement} busy={busy} run={run} />
      <ItemImport statementId={statement.id} statementTotal={statement.totalCents} onImported={refresh} />

      <div className="row-tight note">
        {statement.status === 'cancelled' ? (
          <button
            type="button"
            className="btn btn-sm btn-neutral"
            disabled={busy}
            onClick={() => run(() => callApi('PATCH', `/api/card-statements/${statement.id}`, { json: { status: 'open' } }), 'A fatura não pôde ser reaberta.')}
          >
            Reabrir fatura
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-quiet"
            disabled={busy}
            onClick={() => run(() => callApi('PATCH', `/api/card-statements/${statement.id}`, { json: { status: 'cancelled' } }), 'A fatura não pôde ser cancelada.')}
          >
            Cancelar fatura
          </button>
        )}
        {confirmDelete ? (
          <>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={busy}
              onClick={() => run(() => deleteJson(`/api/card-statements/${statement.id}`), 'A fatura não pôde ser excluída.')}
            >
              Confirmar exclusão da fatura e dos itens
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirmDelete(false)}>
              Manter fatura
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirmDelete(true)}>
            <i className="bi bi-trash" aria-hidden="true" />
            Excluir fatura
          </button>
        )}
      </div>
    </section>
  );
}

type Statement = Extract<ReturnType<typeof useStatementDetail>, { status: 'ready' }>['data'];
type Run = (action: () => Promise<unknown>, fallback: string) => Promise<boolean>;

function Payments({ statement, busy, run }: { statement: Statement; busy: boolean; run: Run }) {
  return (
    <div className="stack-tight">
      <h3 className="h-sub">Pagamento</h3>
      {statement.payments.length > 0 && (
        <ul className="entity-list">
          {statement.payments.map((payment) => (
            <li key={payment.id}>
              <span>
                <strong>{payment.transaction.description}</strong>
                <span className="small muted">
                  {payment.transaction.accountName} · {shortDate(payment.transaction.occurredOn)}
                </span>
              </span>
              <span className="stack-tight right">
                <Money cents={payment.amountCents} />
                <button
                  type="button"
                  className="btn btn-sm btn-quiet"
                  disabled={busy}
                  onClick={() => run(() => deleteJson(`/api/card-statements/${statement.id}/payments/${payment.id}`), 'A conciliação não pôde ser desfeita.')}
                >
                  Desfazer conciliação
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {statement.status === 'open' && statement.candidates.length > 0 && (
        <>
          <p className="small muted">Lançamentos da conta que podem ser o pagamento desta fatura:</p>
          <ul className="entity-list">
            {statement.candidates.map((candidate) => (
              <li key={candidate.transactionId}>
                <span>
                  <strong>{candidate.description}</strong>
                  <span className="small muted">
                    {candidate.accountName} · {shortDate(candidate.occurredOn)}
                  </span>
                  <span className={`chip ${candidate.match === 'exact' ? 'chip-ok' : 'chip-info'}`}>
                    {candidate.match === 'exact' ? 'Valor igual ao que falta' : 'Pagamento parcial'}
                  </span>
                </span>
                <span className="stack-tight right">
                  <Money cents={candidate.amountCents} />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => postJson(`/api/card-statements/${statement.id}/payments`, { transactionId: candidate.transactionId }),
                        'O pagamento não pôde ser conciliado.',
                      )
                    }
                  >
                    Confirmar pagamento
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {statement.status === 'open' && statement.candidates.length === 0 && statement.payments.length === 0 && (
        <p className="small muted">
          Nenhum lançamento da conta entre 15 dias antes e 7 dias depois do vencimento tem valor compatível. Depois de
          pagar, importe o extrato da conta que paga a fatura para conferir.
        </p>
      )}
    </div>
  );
}

function Items({ statement, busy, run }: { statement: Statement; busy: boolean; run: Run }) {
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'charge' | 'credit'>('charge');
  const [installment, setInstallment] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Chave do formulário: reenviar o mesmo formulário não duplica o item.
  const clientKey = useRef<string>('');
  useEffect(() => {
    clientKey.current = crypto.randomUUID();
  }, []);

  const submit = async () => {
    const cents = toCents(amount);
    if (description.trim().length === 0) return setError('Descreva o item, por exemplo o nome da loja.');
    if (cents === null || cents === '0') return setError('Informe o valor do item.');
    let installmentNumber: number | null = null;
    let installmentCount: number | null = null;
    if (installment.trim()) {
      const match = installment.trim().match(/^(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})$/);
      if (!match || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) {
        return setError('Informe a parcela como 2/10.');
      }
      installmentNumber = Number(match[1]);
      installmentCount = Number(match[2]);
    }
    setError(null);
    const saved = await run(
      () =>
        postJson(`/api/card-statements/${statement.id}/items`, {
          occurredOn: date,
          description: description.trim(),
          amountCents: kind === 'credit' ? `-${cents}` : cents,
          installmentNumber,
          installmentCount,
          clientKey: clientKey.current,
        }),
      'O item não pôde ser gravado.',
    );
    // A chave só muda depois de gravar: repetir um envio que falhou reaproveita a mesma.
    if (!saved) return;
    clientKey.current = crypto.randomUUID();
    setDescription('');
    setAmount('');
    setInstallment('');
  };

  return (
    <div className="stack-tight">
      <h3 className="h-sub">
        Itens {statement.itemCount > statement.items.length && `(mostrando ${statement.items.length} de ${statement.itemCount})`}
      </h3>
      {statement.items.length === 0 ? (
        <p className="small muted">Nenhum item lançado. Digite os itens abaixo ou importe o arquivo da fatura.</p>
      ) : (
        <ul className="entity-list">
          {statement.items.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.description}</strong>
                <span className="small muted">
                  {shortDate(item.occurredOn)}
                  {item.installmentNumber && item.installmentCount
                    ? ` · parcela ${item.installmentNumber} de ${item.installmentCount}`
                    : ''}
                  {item.source === 'import' ? ' · importado' : ''}
                </span>
              </span>
              <span className="row-tight">
                <Money cents={item.amountCents} />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remover o item ${item.description}`}
                  disabled={busy}
                  onClick={() => run(() => deleteJson(`/api/card-statements/${statement.id}/items/${item.id}`), 'O item não pôde ser removido.')}
                >
                  <i className="bi bi-x-lg" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="subform">
        <div className="field-row">
          <label className="field">
            Data
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            Descrição
            <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} />
          </label>
          <label className="field">
            Valor
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="R$ 0,00" />
          </label>
          <label className="field">
            Tipo
            <select value={kind} onChange={(event) => setKind(event.target.value as 'charge' | 'credit')}>
              <option value="charge">Compra ou cobrança</option>
              <option value="credit">Estorno ou crédito</option>
            </select>
          </label>
          <label className="field">
            Parcela (opcional)
            <input value={installment} onChange={(event) => setInstallment(event.target.value)} placeholder="2/10" />
          </label>
        </div>
        {error && <FormError>{error}</FormError>}
        <div className="row-tight">
          <button type="button" className="btn btn-sm btn-primary" onClick={submit} disabled={busy}>
            Adicionar item
          </button>
        </div>
      </div>
    </div>
  );
}

type InspectPreview = {
  format: 'csv' | 'ofx' | 'pdf';
  rowCount: number;
  issueCount: number;
  mapping: { roles: string[] } | null;
  dialect: Record<string, unknown> | null;
  preview: {
    lineNumber: number;
    occurredOn: string;
    description: string;
    amountCents: string;
    confidence: { date: number; amount: number; description: number; overall: number } | null;
  }[];
  issues: { lineNumber: number; severity: string; code: string; message: string }[];
  pdf: {
    parserName: string;
    parserVersion: number;
    kind: 'bank' | 'card';
    pageCount: number;
    lowConfidenceCount: number;
    activeContent: boolean;
    declaredTotalCents: string | null;
  } | null;
};

function ItemImport({
  statementId,
  statementTotal,
  onImported,
}: {
  statementId: string;
  statementTotal: string;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<InspectPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = '';
  };

  const inspect = async (chosen: File) => {
    setFile(chosen);
    setPreview(null);
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', chosen);
      setPreview(await postForm<InspectPreview>('/api/imports/inspect', form));
    } catch (caught) {
      setError(errorText(caught, 'O arquivo não pôde ser lido.'));
    }
    setBusy(false);
  };

  const confirm = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      // A gravação usa exatamente o mapeamento que a prévia mostrou.
      if (preview.mapping) form.append('mapping', JSON.stringify(preview.mapping));
      if (preview.dialect) form.append('dialect', JSON.stringify(preview.dialect));
      const outcome = await postForm<{ importedCount: number; duplicateCount: number; lowConfidenceCount: number }>(
        `/api/card-statements/${statementId}/items/import`,
        form,
      );
      const parts = [`${outcome.importedCount} ${outcome.importedCount === 1 ? 'item importado' : 'itens importados'}`];
      if (outcome.duplicateCount > 0) parts.push(`${outcome.duplicateCount} já estavam na fatura`);
      if (outcome.lowConfidenceCount > 0) parts.push(`${outcome.lowConfidenceCount} com leitura incerta ficaram de fora`);
      setResult(`${parts.join('; ')}.`);
      reset();
      onImported();
    } catch (caught) {
      setError(errorText(caught, 'Os itens não puderam ser importados.'));
    }
    setBusy(false);
  };

  const declaredDiffers =
    preview?.pdf?.declaredTotalCents && preview.pdf.declaredTotalCents !== statementTotal ? preview.pdf.declaredTotalCents : null;

  return (
    <div className="stack-tight">
      <h3 className="h-sub">Importar itens de arquivo</h3>
      <p className="small muted">
        CSV, OFX ou PDF da fatura. O arquivo é lido neste dispositivo, nada é gravado antes da confirmação e o
        arquivo não é guardado.
      </p>
      <label className="field">
        Arquivo da fatura
        <input
          ref={input}
          type="file"
          accept=".csv,.ofx,.pdf,.txt,text/csv,text/plain,application/x-ofx,application/pdf"
          disabled={busy}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) void inspect(chosen);
          }}
        />
      </label>
      {busy && !preview && <p className="small muted" aria-live="polite">Lendo o arquivo…</p>}
      {error && <FormError>{error}</FormError>}
      {result && (
        <p className="callout callout-ok" role="status">
          <i className="bi bi-check2-circle" aria-hidden="true" />
          <span className="small">{result}</span>
        </p>
      )}

      {preview && (
        <div className="subform">
          <p className="small">
            {preview.rowCount} {preview.rowCount === 1 ? 'linha lida' : 'linhas lidas'} · formato{' '}
            {preview.format.toUpperCase()}
            {preview.pdf && ` · ${preview.pdf.pageCount} ${preview.pdf.pageCount === 1 ? 'página' : 'páginas'} · ${preview.pdf.parserName}, versão ${preview.pdf.parserVersion}`}
          </p>
          {preview.pdf?.kind === 'bank' && (
            <p className="callout callout-warn">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <span className="small">
                O arquivo parece um extrato de conta, não uma fatura. Na fatura, as saídas do extrato viram cobranças.
              </span>
            </p>
          )}
          {preview.pdf && preview.pdf.lowConfidenceCount > 0 && (
            <p className="callout callout-warn">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <span className="small">
                {preview.pdf.lowConfidenceCount}{' '}
                {preview.pdf.lowConfidenceCount === 1 ? 'linha foi lida' : 'linhas foram lidas'} com incerteza e não
                {preview.pdf.lowConfidenceCount === 1 ? ' será importada' : ' serão importadas'}. Lance{' '}
                {preview.pdf.lowConfidenceCount === 1 ? 'essa linha' : 'essas linhas'} à mão, conferindo o PDF.
              </span>
            </p>
          )}
          {declaredDiffers && (
            <p className="callout callout-info">
              <i className="bi bi-info-circle" aria-hidden="true" />
              <span className="small">
                O PDF declara total de <Money cents={declaredDiffers} />, diferente do total cadastrado nesta fatura (
                <Money cents={statementTotal} />
                ). Confira antes de importar.
              </span>
            </p>
          )}
          <ul className="entity-list">
            {preview.preview.map((row) => (
              <li key={row.lineNumber}>
                <span>
                  <strong>{row.description}</strong>
                  <span className="small muted">{shortDate(row.occurredOn)}</span>
                  {row.confidence && <ConfidenceChip confidence={row.confidence} />}
                </span>
                {/* Na fatura, a saída do extrato é cobrança: o sinal é invertido para exibir. */}
                <Money cents={negate(row.amountCents)} />
              </li>
            ))}
          </ul>
          {preview.rowCount > preview.preview.length && (
            <p className="small muted">Mostrando as {preview.preview.length} primeiras de {preview.rowCount} linhas.</p>
          )}
          {preview.issues.length > 0 && (
            <details>
              <summary className="small">
                {preview.issueCount} {preview.issueCount === 1 ? 'aviso de leitura' : 'avisos de leitura'}
              </summary>
              <ul className="list-plain small">
                {preview.issues.map((issue) => (
                  <li key={`${issue.lineNumber}-${issue.code}`}>
                    {issue.lineNumber > 0 ? `Linha ${issue.lineNumber}: ` : ''}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="row-tight">
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy || preview.rowCount === 0}>
              {busy ? 'Importando…' : `Importar ${preview.rowCount} ${preview.rowCount === 1 ? 'item' : 'itens'}`}
            </button>
            <button type="button" className="btn btn-neutral" onClick={reset} disabled={busy}>
              Escolher outro arquivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Benefícios ────────────────────────────────────────────────── */

function BenefitAmount({ benefit, value }: { benefit: Pick<BenefitRow, 'kind'>; value: string }) {
  if (benefit.kind === 'cashback') return <Money cents={value} />;
  const units = new Intl.NumberFormat('pt-BR').format(BigInt(value));
  return (
    <span className="num">
      {units} {benefit.kind === 'points' ? 'pontos' : 'milhas'}
    </span>
  );
}

function Benefits({ card, reload }: { card: CardDetailPayload; reload: () => void }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (benefit: BenefitRow) => {
    setBusy(true);
    setError(null);
    try {
      await deleteJson(`/api/card-benefits/${benefit.id}`);
      reload();
    } catch (caught) {
      setError(errorText(caught, 'O benefício não pôde ser removido.'));
    }
    setBusy(false);
  };

  return (
    <section className="card" aria-labelledby="beneficios">
      <div className="row-between">
        <h2 className="h-display" id="beneficios">
          Benefícios
        </h2>
        {!creating && (
          <button type="button" className="btn btn-sm btn-neutral" onClick={() => setCreating(true)}>
            <i className="bi bi-plus-lg" aria-hidden="true" />
            Adicionar programa
          </button>
        )}
      </div>
      {creating && (
        <BenefitForm
          cardId={card.id}
          onDone={() => {
            setCreating(false);
            reload();
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      {card.benefits.length === 0 && !creating && (
        <p className="small muted">
          Nenhum programa cadastrado. Registre o saldo de cashback, pontos ou milhas e a próxima expiração para ser
          avisado antes de perder pontos.
        </p>
      )}
      {error && <FormError>{error}</FormError>}
      {card.benefits.length > 0 && (
        <ul className="entity-list">
          {card.benefits.map((benefit) => {
            const soon = benefit.daysUntilExpiry !== null && benefit.daysUntilExpiry >= 0 && benefit.daysUntilExpiry <= 60;
            const expired = benefit.daysUntilExpiry !== null && benefit.daysUntilExpiry < 0;
            return (
              <li key={benefit.id}>
                <span>
                  <strong>
                    {BENEFIT_KIND_LABELS[benefit.kind]} · {benefit.programName}
                  </strong>
                  {benefit.expiresOn ? (
                    <span className="small muted">
                      {benefit.expiringBalance ? (
                        <>
                          <BenefitAmount benefit={benefit} value={benefit.expiringBalance} />{' '}
                        </>
                      ) : (
                        'Saldo '
                      )}
                      {expired ? 'expirou em' : 'expira em'} {shortDate(benefit.expiresOn)}
                    </span>
                  ) : (
                    <span className="small muted">Sem data de expiração informada</span>
                  )}
                  {soon && (
                    <span className="chip chip-warn">
                      {benefit.daysUntilExpiry === 0 ? 'Expira hoje' : `Expira em ${benefit.daysUntilExpiry} dias`}
                    </span>
                  )}
                  {expired && <span className="chip chip-err">Data de expiração passou</span>}
                </span>
                <span className="stack-tight right">
                  <BenefitAmount benefit={benefit} value={benefit.balance} />
                  <button type="button" className="btn btn-sm btn-quiet" disabled={busy} onClick={() => remove(benefit)}>
                    Remover
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function BenefitForm({ cardId, onDone, onCancel }: { cardId: string; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<BenefitRow['kind']>('points');
  const [programName, setProgramName] = useState('');
  const [balance, setBalance] = useState('');
  const [expiring, setExpiring] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parse = (raw: string) => (kind === 'cashback' ? toCents(raw) : toUnits(raw));

  const submit = async () => {
    if (!programName.trim()) return setError('Informe o nome do programa.');
    const balanceValue = parse(balance);
    if (balanceValue === null) return setError(kind === 'cashback' ? 'Informe o saldo em reais.' : 'Informe o saldo como número inteiro.');
    const expiringValue = expiring.trim() ? parse(expiring) : null;
    if (expiring.trim() && expiringValue === null) return setError('O saldo que expira não é um valor válido.');
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/cards/${cardId}/benefits`, {
        kind,
        programName: programName.trim(),
        balance: balanceValue,
        expiringBalance: expiringValue,
        expiresOn: expiresOn || null,
      });
      onDone();
    } catch (caught) {
      setError(errorText(caught, 'O benefício não pôde ser cadastrado.'));
      setBusy(false);
    }
  };

  return (
    <div className="subform">
      <div className="field-row">
        <label className="field">
          Tipo
          <select value={kind} onChange={(event) => setKind(event.target.value as BenefitRow['kind'])}>
            <option value="points">Pontos</option>
            <option value="miles">Milhas</option>
            <option value="cashback">Cashback</option>
          </select>
        </label>
        <label className="field">
          Programa
          <input value={programName} onChange={(event) => setProgramName(event.target.value)} maxLength={80} />
        </label>
        <label className="field">
          Saldo atual
          <input
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            inputMode={kind === 'cashback' ? 'decimal' : 'numeric'}
            placeholder={kind === 'cashback' ? 'R$ 0,00' : '0'}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          Quanto expira primeiro (opcional)
          <input
            value={expiring}
            onChange={(event) => setExpiring(event.target.value)}
            inputMode={kind === 'cashback' ? 'decimal' : 'numeric'}
          />
        </label>
        <label className="field">
          Data da expiração (opcional)
          <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
        </label>
      </div>
      {error && <FormError>{error}</FormError>}
      <div className="row-tight">
        <button type="button" className="btn btn-sm btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar programa'}
        </button>
        <button type="button" className="btn btn-sm btn-neutral" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

