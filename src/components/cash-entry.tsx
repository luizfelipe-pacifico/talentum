'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-state';
import { ApiError, getJson, postJson } from '@/lib/api-client';
import { trapFocus } from '@/lib/focus-trap';
import { formatCents, parseBrlToCents } from '@/lib/format';

/* Lançamento rápido em dinheiro (MVP 5 de docs/ROADMAP.md).

   Padrão dos apps de finanças e de banco: um botão sempre visível abre uma
   folha curta com o tipo (gasto ou entrada), o valor em destaque, a descrição e
   a data de hoje já preenchida. No celular a folha ocupa a largura toda
   (docs/DESIGN-SYSTEM.md, Dialogs and sheets). Depois de salvar, a confirmação
   oferece Desfazer em vez de pedir confirmação antes (NN/g: prefira desfazer).

   O backend decide tudo: a conta precisa ser do tipo Dinheiro, a data não pode
   estar no futuro, e a chave de idempotência gerada aqui uma vez por formulário
   impede o lançamento duplicado por clique repetido ou reenvio. */

type Account = { id: string; name: string; type: string; isActive: boolean };
type Category = { id: string; name: string; kind: string };
type Saved = { transactionId: string; timelineEventId: string | null; cents: string; direction: Direction; accountName: string };
type Direction = 'expense' | 'income';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const yearAgoIso = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const newKey = () => crypto.randomUUID();
const problem = (cause: unknown, fallback: string) => (cause instanceof ApiError && cause.publicMessage ? cause.publicMessage : fallback);

export function CashEntryDialog() {
  const app = useApp();
  const trapRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'loading' | 'no-profile' | 'error' | 'ready'>('loading');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [direction, setDirection] = useState<Direction>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [walletName, setWalletName] = useState('Dinheiro');
  const [walletBalance, setWalletBalance] = useState('');
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => (trapRef.current ? trapFocus(trapRef.current) : undefined), []);

  // O valor é o primeiro campo da folha: o foco vai para ele quando o formulário
  // aparece, como no teclado numérico que os apps de banco abrem direto.
  useEffect(() => {
    if (status === 'ready' && accounts.length > 0 && !saved) amountRef.current?.focus();
  }, [status, accounts.length, saved]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [accountList, categoryList] = await Promise.all([
        getJson<{ hasProfile: boolean; accounts?: Account[] }>('/api/accounts'),
        getJson<{ hasProfile: boolean; categories?: Category[] }>('/api/categories'),
      ]);
      if (!accountList.hasProfile) return setStatus('no-profile');
      const cash = (accountList.accounts ?? []).filter((account) => account.type === 'cash' && account.isActive);
      setAccounts(cash);
      setAccountId((current) => current || cash[0]?.id || '');
      setCategories(categoryList.categories ?? []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cents = parseBrlToCents(amount);
  const signed = cents ? (direction === 'expense' ? `-${cents}` : cents) : null;
  const verb = direction === 'expense' ? 'gasto' : 'entrada';
  const visibleCategories = categories.filter((category) => category.kind === direction);

  async function createWallet(event: FormEvent) {
    event.preventDefault();
    const balance = walletBalance.trim() ? parseBrlToCents(walletBalance) : null;
    if (walletBalance.trim() && !balance && walletBalance.trim() !== '0') {
      setError('Informe o valor em reais, como 150,00, ou deixe em branco.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await postJson('/api/accounts', {
        name: walletName.trim() || 'Dinheiro',
        type: 'cash',
        ...(walletBalance.trim() ? { balanceCents: balance ?? '0' } : {}),
      });
      await load();
    } catch (cause) {
      setError(problem(cause, 'Não foi possível criar a conta Dinheiro. Nada foi gravado.'));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!signed) {
      setError('Informe um valor maior que zero, como 12,50.');
      amountRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await postJson<{ transactionId: string; timelineEventId: string | null }>('/api/transactions', {
        accountId,
        occurredOn: date,
        description: description.trim(),
        amountCents: signed,
        categoryId: categoryId || null,
        idempotencyKey: key,
      });
      setSaved({
        transactionId: result.transactionId,
        timelineEventId: result.timelineEventId,
        cents: cents as string,
        direction,
        accountName: accounts.find((account) => account.id === accountId)?.name ?? 'Dinheiro',
      });
      setUndone(false);
    } catch (cause) {
      // O que a pessoa digitou fica no formulário (regra 10 de UX writing).
      setError(problem(cause, 'Não foi possível registrar o lançamento. Nada foi gravado. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!saved?.timelineEventId) return;
    setBusy(true);
    setError('');
    try {
      await postJson(`/api/timeline-events/${saved.timelineEventId}/revert`, {});
      setUndone(true);
    } catch (cause) {
      setError(problem(cause, 'Não foi possível desfazer. O lançamento continua registrado.'));
    } finally {
      setBusy(false);
    }
  }

  function another() {
    setSaved(null);
    setUndone(false);
    setAmount('');
    setDescription('');
    setCategoryId('');
    setDate(todayIso());
    setKey(newKey());
    setError('');
    requestAnimationFrame(() => amountRef.current?.focus());
  }

  const body = () => {
    if (status === 'loading') return <p className="muted" aria-busy="true">Consultando suas contas de dinheiro…</p>;
    if (status === 'error') {
      return (
        <div className="stack-sm" role="alert">
          <p className="muted">Não foi possível consultar suas contas. Nada foi gravado.</p>
          <button type="button" className="btn btn-neutral" onClick={() => void load()}>Tentar novamente</button>
        </div>
      );
    }
    if (status === 'no-profile') {
      return (
        <div className="stack-sm">
          <p className="muted">Faça o primeiro acesso para começar a registrar lançamentos.</p>
          <Link className="btn btn-primary" href="/onboarding" onClick={app.close}>Fazer o primeiro acesso</Link>
        </div>
      );
    }
    if (saved) {
      const money = formatCents(saved.cents);
      return (
        <div className="stack-sm" role="status">
          {undone ? (
            <p className="callout callout-info small">O {saved.direction === 'expense' ? 'gasto' : 'lançamento de entrada'} de {money.symbol} {money.value} foi desfeito.</p>
          ) : (
            <p className="callout callout-ok small">
              {saved.direction === 'expense' ? 'Gasto' : 'Entrada'} de {money.symbol} {money.value} registrado em {saved.accountName}.
            </p>
          )}
          {error && <p className="callout callout-err small" role="alert">{error}</p>}
          <div className="row-tight">
            <button type="button" className="btn btn-primary" onClick={another}>Registrar outro lançamento</button>
            {!undone && saved.timelineEventId && <button type="button" disabled={busy} className="btn btn-neutral" onClick={undo}>Desfazer</button>}
            {!undone && <Link className="btn btn-quiet" href={`/extratos/${saved.transactionId}`} onClick={app.close}>Ver lançamento</Link>}
          </div>
        </div>
      );
    }
    if (accounts.length === 0) {
      return (
        <form className="stack-sm" onSubmit={createWallet}>
          <p className="muted">Lançamentos à mão vão para uma conta do tipo Dinheiro, separada das contas de banco. Assim o extrato do banco nunca duplica o que você registrou aqui.</p>
          {error && <p className="callout callout-err small" role="alert">{error}</p>}
          <label className="field">Nome da conta<input required maxLength={120} value={walletName} onChange={(event) => setWalletName(event.target.value)} /></label>
          <label className="field">Quanto você tem em dinheiro hoje (opcional)<input inputMode="decimal" value={walletBalance} onChange={(event) => setWalletBalance(event.target.value)} placeholder="0,00" /><span className="field-hint">Sem esse valor, o saldo desta conta fica como desconhecido no Dashboard.</span></label>
          <div className="row-tight"><button type="submit" disabled={busy} className="btn btn-primary">Criar conta Dinheiro</button></div>
        </form>
      );
    }
    return (
      <form className="stack-sm" onSubmit={submit} noValidate>
        {/* biome-ignore lint/a11y/useSemanticElements: radiogroup de dois botões segmentados, no padrão do HIG */}
        <div className="segmented" role="radiogroup" aria-label="Tipo de lançamento">
          <label><input type="radio" name="direcao" value="expense" checked={direction === 'expense'} onChange={() => { setDirection('expense'); setCategoryId(''); }} /><i className="bi bi-arrow-up-right" aria-hidden="true" />Gasto</label>
          <label><input type="radio" name="direcao" value="income" checked={direction === 'income'} onChange={() => { setDirection('income'); setCategoryId(''); }} /><i className="bi bi-arrow-down-left" aria-hidden="true" />Entrada</label>
        </div>
        {error && <p className="callout callout-err small" role="alert">{error}</p>}
        <label className="field field-amount">Valor em reais<input ref={amountRef} required inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" aria-invalid={amount !== '' && !cents} /></label>
        <label className="field">Descrição<input required maxLength={120} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={direction === 'expense' ? 'Ex.: feira, estacionamento' : 'Ex.: venda de um item usado'} /></label>
        <div className="grid grid-260">
          <label className="field">Data<input type="date" required value={date} min={yearAgoIso()} max={todayIso()} onChange={(event) => setDate(event.target.value)} /></label>
          <label className="field">Categoria (opcional)<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Decidir depois na conciliação</option>{visibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          {accounts.length > 1 && (
            <label className="field">Conta<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          )}
        </div>
        <div className="row-tight">
          <button type="submit" disabled={busy || !description.trim()} className="btn btn-primary">
            {busy ? 'Registrando…' : cents ? `Registrar ${verb} de ${formatCents(cents).symbol} ${formatCents(cents).value}` : `Registrar ${verb}`}
          </button>
          <button type="button" className="btn btn-neutral" onClick={app.close}>Fechar</button>
        </div>
      </form>
    );
  };

  return (
    <div className="overlay">
      <button type="button" className="overlay-scrim" aria-label="Fechar" onClick={app.close} />
      <div ref={trapRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="lancamento-dinheiro-titulo" className="dialog dialog-md">
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title" id="lancamento-dinheiro-titulo">Lançamento em dinheiro</h2>
            <p className="small muted">Para o que não aparece em extrato: pagamentos e recebimentos em espécie.</p>
          </div>
          <button type="button" className="close-button" onClick={app.close} aria-label="Fechar"><i className="bi bi-x-lg" /></button>
        </div>
        {body()}
      </div>
    </div>
  );
}
