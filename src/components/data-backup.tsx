'use client';

/* Dados e backup (/perfil/privacidade): pontos de restauração, backup cifrado,
   exportação e exclusão (Stages 11, 18 e 19).

   Referências: a lista de backups com "Restaurar" por item segue o Time
   Machine e a Restauração do Sistema do Windows; a exclusão com frase digitada
   segue a exclusão de repositório do GitHub. Confirmações dizem o que muda e
   se dá para voltar atrás, com botões que repetem o verbo
   (docs/DESIGN-SYSTEM.md, UX writing 12). Tudo acontece neste computador;
   nada é enviado para fora dele. */

import '@/app/local-data.css';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { StateArt } from '@/components/state-art';
import { ApiError, callApi, callApiFile, getJson, saveFile } from '@/lib/api-client';

type RestorePoint = { id: string; kind: 'manual' | 'pre_migration' | 'pre_restore' | 'pre_deletion'; createdAt: string; byteSize: number; status: 'available' | 'damaged' };
type Pending = { createdAt: string; source: 'restore_point' | 'encrypted_backup'; sourceRestorePointId: string | null; safetyRestorePointId: string | null } | null;
type PointsPayload = { restorePoints: RestorePoint[]; pendingRestore: Pending };

const KIND_LABEL: Record<RestorePoint['kind'], string> = {
  manual: 'Criado por você',
  pre_migration: 'Automático, antes de atualizar o Talentum',
  pre_restore: 'Automático, antes de uma restauração',
  pre_deletion: 'Automático, antes de apagar os dados',
};

const DELETION_PHRASE = 'APAGAR MEUS DADOS';
const PASSPHRASE_MIN = 12;

const when = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatWhen = (iso: string) => when.format(new Date(iso));

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError && error.publicMessage ? error.publicMessage : fallback);

const RESTART_TEXT = 'Para concluir, bloqueie o Talentum e desbloqueie de novo, ou feche e abra o aplicativo. Até lá, os dados atuais continuam em uso.';

function RestorePoints({ onChanged, refreshKey }: { onChanged: () => void; refreshKey: number }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; payload: PointsPayload }>({ status: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'restore' | 'delete' } | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  // Uma chave por tentativa de criação: repetir o clique depois de uma falha
  // de rede reaproveita a chave e não cria dois pontos.
  const [attemptKey, setAttemptKey] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is the reload trigger from sibling sections
  const load = useCallback(() => {
    getJson<PointsPayload>('/api/restore-points')
      .then((payload) => setState({ status: 'ready', payload }))
      .catch(() => setState({ status: 'error' }));
  }, [refreshKey]);
  useEffect(load, [load]);

  const act = async (id: string, task: () => Promise<string>) => {
    setBusy(id);
    setMessage(null);
    try {
      setMessage({ tone: 'ok', text: await task() });
      setConfirm(null);
      load();
      onChanged();
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error, 'Não foi possível concluir. Os dados atuais não foram alterados.') });
    } finally {
      setBusy(null);
    }
  };

  const create = () => {
    const key = attemptKey ?? crypto.randomUUID();
    setAttemptKey(key);
    return act('create', async () => {
      await callApi('POST', '/api/restore-points', { json: { idempotencyKey: key } });
      setAttemptKey(null);
      return 'Ponto de restauração criado e verificado.';
    });
  };

  if (state.status === 'loading')
    return (
      <div aria-busy="true">
        <span className="sr-only">Consultando pontos de restauração</span>
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line" />
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="callout callout-warn" role="alert">
        <i className="bi bi-exclamation-triangle" aria-hidden="true" />
        <div>
          <p className="small">Não foi possível consultar os pontos de restauração. Nada foi alterado.</p>
          <button type="button" className="btn btn-sm btn-neutral" onClick={load}>
            Tentar novamente
          </button>
        </div>
      </div>
    );

  const { restorePoints, pendingRestore } = state.payload;
  return (
    <div className="stack">
      {pendingRestore && (
        <div className="callout callout-warn">
          <i className="bi bi-arrow-repeat" aria-hidden="true" />
          <div>
            <p className="callout-title">Restauração agendada em {formatWhen(pendingRestore.createdAt)}</p>
            <p className="small">
              {pendingRestore.source === 'encrypted_backup' ? 'Os dados do backup cifrado' : 'Os dados do ponto escolhido'} entram em uso no próximo desbloqueio. {RESTART_TEXT}
            </p>
            <button type="button" className="btn btn-sm btn-neutral" disabled={busy !== null} onClick={() => void act('cancel', async () => {
              await callApi('DELETE', '/api/pending-restore');
              return 'Restauração cancelada. Os dados atuais continuam em uso.';
            })}>
              Cancelar restauração
            </button>
          </div>
        </div>
      )}

      <div>
        <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void create()}>
          <i className="bi bi-plus-lg" aria-hidden="true" />
          {busy === 'create' ? 'Criando e verificando…' : 'Criar ponto de restauração'}
        </button>
      </div>

      <p role="status" aria-live="polite" className={message?.tone === 'error' ? 'field-error' : 'small muted'}>
        {message?.text ?? ''}
      </p>

      {restorePoints.length === 0 ? (
        <div className="empty">
          <StateArt name="historico-vazio" size="sm" />
          <p className="muted">Nenhum ponto de restauração ainda. O Talentum cria um sozinho antes de cada atualização que muda a estrutura dos dados.</p>
        </div>
      ) : (
        <ul className="restore-list" aria-label="Pontos de restauração">
          {restorePoints.map((point) => {
            const protectedPoint = pendingRestore && (pendingRestore.safetyRestorePointId === point.id || pendingRestore.sourceRestorePointId === point.id);
            return (
              <li key={point.id}>
                <span className="restore-meta">
                  <strong>{formatWhen(point.createdAt)}</strong>
                  <span className="small muted">
                    {KIND_LABEL[point.kind]} · {formatSize(point.byteSize)}
                  </span>
                  {point.status === 'damaged' && (
                    <span className="chip chip-err">
                      <i className="bi bi-exclamation-octagon" aria-hidden="true" />
                      Cópia incompleta, não pode ser restaurada
                    </span>
                  )}
                </span>
                <span className="row-tight">
                  <button type="button" className="btn btn-sm btn-neutral" disabled={busy !== null || point.status === 'damaged'} onClick={() => setConfirm({ id: point.id, action: 'restore' })}>
                    Restaurar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-quiet"
                    disabled={busy !== null || Boolean(protectedPoint)}
                    title={protectedPoint ? 'Faz parte da restauração agendada' : undefined}
                    onClick={() => setConfirm({ id: point.id, action: 'delete' })}
                    aria-label={`Apagar o ponto de ${formatWhen(point.createdAt)}`}
                  >
                    Apagar
                  </button>
                </span>
                {confirm?.id === point.id && (
                  <div className={`confirm-panel ${confirm.action === 'delete' ? 'confirm-panel-danger' : ''}`} style={{ flexBasis: '100%' }}>
                    {confirm.action === 'restore' ? (
                      <>
                        <p className="callout-title">Restaurar os dados de {formatWhen(point.createdAt)}?</p>
                        <p className="small">
                          O Talentum confere a cópia e guarda os dados atuais num novo ponto de restauração antes da troca. Lançamentos e alterações feitos depois de {formatWhen(point.createdAt)} saem de uso, mas continuam nesse novo ponto. {RESTART_TEXT}
                        </p>
                        <div className="row-tight">
                          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void act(point.id, async () => {
                            await callApi('POST', `/api/restore-points/${point.id}/restore`, { json: { confirm: 'restore' } });
                            return `Restauração agendada. ${RESTART_TEXT}`;
                          })}>
                            {busy === point.id ? 'Conferindo a cópia…' : 'Agendar restauração'}
                          </button>
                          <button type="button" className="btn btn-neutral" disabled={busy !== null} onClick={() => setConfirm(null)}>
                            Manter dados atuais
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="callout-title">Apagar o ponto de {formatWhen(point.createdAt)}?</p>
                        <p className="small">A cópia sai deste computador e não dá para restaurá-la depois. Os dados atuais não mudam.</p>
                        <div className="row-tight">
                          <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => void act(point.id, async () => {
                            await callApi('DELETE', `/api/restore-points/${point.id}`);
                            return 'Ponto de restauração apagado.';
                          })}>
                            Apagar ponto
                          </button>
                          <button type="button" className="btn btn-neutral" disabled={busy !== null} onClick={() => setConfirm(null)}>
                            Manter ponto
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EncryptedBackup({ onChanged }: { onChanged: () => void }) {
  const ids = useId();
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState<'create' | 'restore' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePass, setRestorePass] = useState('');

  const tooShort = passphrase.length > 0 && [...passphrase].length < PASSPHRASE_MIN;
  const mismatch = repeat.length > 0 && repeat !== passphrase;
  const canCreate = [...passphrase].length >= PASSPHRASE_MIN && repeat === passphrase && understood && busy === null;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) return;
    setBusy('create');
    setMessage(null);
    try {
      const { blob, fileName } = await callApiFile('POST', '/api/encrypted-backups', { json: { passphrase } });
      saveFile(blob, fileName);
      setPassphrase('');
      setRepeat('');
      setUnderstood(false);
      setMessage({ tone: 'ok', text: `Backup cifrado gerado: ${fileName}. Guarde o arquivo e a senha em lugares diferentes.` });
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error, 'Não foi possível gerar o backup cifrado. Os dados atuais não foram alterados.') });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (event: FormEvent) => {
    event.preventDefault();
    if (!restoreFile || restorePass.length === 0 || busy) return;
    setBusy('restore');
    setMessage(null);
    const form = new FormData();
    form.set('file', restoreFile);
    form.set('passphrase', restorePass);
    try {
      await callApi('POST', '/api/encrypted-backups/restore', { form });
      setRestorePass('');
      setMessage({ tone: 'ok', text: `Backup conferido e restauração agendada. ${RESTART_TEXT}` });
      onChanged();
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error, 'Não foi possível abrir o backup. Os dados atuais não foram alterados.') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <div className="callout callout-warn">
        <i className="bi bi-key" aria-hidden="true" />
        <p className="small">
          <strong>Sem a senha, o backup não abre.</strong> O Talentum não guarda a senha e não tem como recuperá-la. Se você esquecer, o arquivo fica inútil para você e para qualquer pessoa.
        </p>
      </div>

      <form className="stack" onSubmit={(event) => void create(event)} noValidate>
        <label className="field" htmlFor={`${ids}-senha`}>
          Senha do backup
          <input
            id={`${ids}-senha`}
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            aria-describedby={`${ids}-senha-dica`}
            aria-invalid={tooShort}
          />
          <span id={`${ids}-senha-dica`} className={tooShort ? 'field-error' : 'field-hint'}>
            Pelo menos {PASSPHRASE_MIN} caracteres. Uma frase longa é mais fácil de lembrar e mais difícil de adivinhar.
          </span>
        </label>
        <label className="field" htmlFor={`${ids}-repetir`}>
          Repita a senha
          <input id={`${ids}-repetir`} type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} aria-invalid={mismatch} aria-describedby={`${ids}-repetir-erro`} />
          <span id={`${ids}-repetir-erro`} className="field-error">
            {mismatch ? 'As duas senhas não são iguais.' : ''}
          </span>
        </label>
        <label className="check-field">
          <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
          <span>Entendi que, sem esta senha, ninguém consegue abrir o backup, nem o Talentum.</span>
        </label>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!canCreate}>
            <i className="bi bi-download" aria-hidden="true" />
            {busy === 'create' ? 'Cifrando os dados…' : 'Baixar backup cifrado'}
          </button>
        </div>
      </form>

      <form className="stack" onSubmit={(event) => void restore(event)} noValidate style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <h3 className="callout-title">Restaurar de um backup cifrado</h3>
        <p className="small muted">O arquivo é conferido antes de qualquer troca. Os dados atuais vão para um ponto de restauração. {RESTART_TEXT}</p>
        <label className="field" htmlFor={`${ids}-arquivo`}>
          Arquivo de backup (.talentum)
          <input id={`${ids}-arquivo`} type="file" accept=".talentum,application/octet-stream" onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)} />
        </label>
        <label className="field" htmlFor={`${ids}-senha-restaurar`}>
          Senha do backup
          <input id={`${ids}-senha-restaurar`} type="password" autoComplete="current-password" value={restorePass} onChange={(event) => setRestorePass(event.target.value)} />
        </label>
        <div>
          <button type="submit" className="btn btn-neutral" disabled={!restoreFile || restorePass.length === 0 || busy !== null}>
            <i className="bi bi-upload" aria-hidden="true" />
            {busy === 'restore' ? 'Conferindo o backup…' : 'Conferir e agendar restauração'}
          </button>
        </div>
      </form>

      <p role="status" aria-live="polite" className={message?.tone === 'error' ? 'field-error' : 'small muted'}>
        {message?.text ?? ''}
      </p>
    </div>
  );
}

function Exports({ hasProfile }: { hasProfile: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const fetchFile = async (path: string) => {
    setBusy(path);
    setMessage(null);
    try {
      const { blob, fileName } = await callApiFile('GET', path);
      saveFile(blob, fileName);
      setMessage({ tone: 'ok', text: `Arquivo gerado: ${fileName}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: errorText(error, 'Não foi possível gerar o arquivo. Tente de novo.') });
    } finally {
      setBusy(null);
    }
  };

  if (!hasProfile) return <p className="muted">Nada para exportar: ainda não há dados neste computador.</p>;

  return (
    <div className="stack">
      <div className="row-tight">
        <button type="button" className="btn btn-neutral" disabled={busy !== null} onClick={() => void fetchFile('/api/exports/json')}>
          <i className="bi bi-filetype-json" aria-hidden="true" />
          {busy === '/api/exports/json' ? 'Gerando arquivo…' : 'Baixar todos os dados em JSON'}
        </button>
        <button type="button" className="btn btn-neutral" disabled={busy !== null} onClick={() => void fetchFile('/api/exports/transactions-csv')}>
          <i className="bi bi-filetype-csv" aria-hidden="true" />
          {busy === '/api/exports/transactions-csv' ? 'Gerando arquivo…' : 'Baixar lançamentos em CSV'}
        </button>
      </div>
      <p className="small muted">
        O JSON tem todas as tabelas, num formato documentado e versionado; as chaves PIX saem mascaradas. O CSV abre em planilhas, com ponto e vírgula e vírgula decimal. Os arquivos não são cifrados: guarde-os em lugar seguro.
      </p>
      <p role="status" aria-live="polite" className={message?.tone === 'error' ? 'field-error' : 'small muted'}>
        {message?.text ?? ''}
      </p>
    </div>
  );
}

function DeleteAll({ hasProfile, onChanged }: { hasProfile: boolean; onChanged: () => void }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [includePoints, setIncludePoints] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (typed !== DELETION_PHRASE || busy) return;
    setBusy(true);
    setResult(null);
    try {
      await callApi('POST', '/api/local-data/deletion', { json: { confirmation: DELETION_PHRASE, includeRestorePoints: includePoints } });
      setResult({
        tone: 'ok',
        text: includePoints
          ? 'Todos os dados e pontos de restauração foram apagados deste computador.'
          : 'Todos os dados foram apagados. Um ponto de restauração guardou a situação anterior, caso você queira voltar.',
      });
      setOpen(false);
      setTyped('');
      onChanged();
    } catch (error) {
      setResult({ tone: 'error', text: errorText(error, 'Não foi possível apagar os dados. Nada foi apagado.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <p className="small">
        Apaga do banco deste computador o perfil, as contas, os lançamentos, as importações, as regras e o histórico. Por padrão, um ponto de restauração é criado antes, para você poder voltar atrás.
      </p>
      {!open ? (
        <div>
          <button type="button" className="btn btn-danger" disabled={!hasProfile} onClick={() => setOpen(true)}>
            <i className="bi bi-trash3" aria-hidden="true" />
            Apagar todos os dados locais
          </button>
          {!hasProfile && <p className="small muted">Não há dados para apagar.</p>}
        </div>
      ) : (
        <form className="confirm-panel confirm-panel-danger" onSubmit={(event) => void submit(event)} noValidate>
          <p className="callout-title">Apagar todos os dados deste computador?</p>
          <p className="small">
            {includePoints
              ? 'Os pontos de restauração também serão apagados. Não será possível desfazer.'
              : 'Um ponto de restauração é criado antes. Para desfazer, restaure esse ponto na lista acima.'}
          </p>
          <label className="check-field">
            <input type="checkbox" checked={includePoints} onChange={(event) => setIncludePoints(event.target.checked)} />
            <span>Apagar também os pontos de restauração. Sem eles, não há como voltar atrás.</span>
          </label>
          <label className="field" htmlFor={`${ids}-frase`}>
            Para confirmar, digite {DELETION_PHRASE}
            <input id={`${ids}-frase`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <div className="row-tight">
            <button type="submit" className="btn btn-danger" disabled={typed !== DELETION_PHRASE || busy}>
              {busy ? 'Apagando…' : 'Apagar todos os dados'}
            </button>
            <button type="button" className="btn btn-neutral" disabled={busy} onClick={() => setOpen(false)}>
              Manter meus dados
            </button>
          </div>
        </form>
      )}
      <p role="status" aria-live="polite" className={result?.tone === 'error' ? 'field-error' : 'small muted'}>
        {result?.text ?? ''}
        {result?.tone === 'ok' && (
          <>
            {' '}
            <Link className="btn-link" href="/onboarding">
              Fazer o primeiro acesso de novo
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

export function DataBackupScreen() {
  const [profile, setProfile] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; hasProfile: boolean }>({ status: 'loading' });
  const [refreshKey, setRefreshKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey re-reads the profile after a deletion
  useEffect(() => {
    getJson<{ hasProfile: boolean }>('/api/profile')
      .then((payload) => setProfile({ status: 'ready', hasProfile: payload.hasProfile }))
      .catch(() => setProfile({ status: 'error' }));
  }, [refreshKey]);

  const changed = useCallback(() => setRefreshKey((value) => value + 1), []);
  const hasProfile = profile.status === 'ready' && profile.hasProfile;

  return (
    <div className="stack-lg">
      <section className="card card-lg">
        <p className="eyebrow">Neste computador</p>
        <h2 className="h-display">Seus dados ficam aqui</h2>
        <p className="muted">
          Contas, lançamentos e histórico ficam salvos só neste computador. Pontos de restauração, backup cifrado e exportações também são gerados e guardados aqui; nada é enviado para a nuvem.
        </p>
        {profile.status === 'error' && (
          <p className="field-error" role="alert">
            Não foi possível consultar o perfil local. Exportação e exclusão ficam indisponíveis até a consulta responder.
          </p>
        )}
      </section>

      <div className="data-grid">
        <section className="card" aria-labelledby="titulo-pontos">
          <div className="card-header">
            <h2 className="h-display" id="titulo-pontos">
              Pontos de restauração
            </h2>
          </div>
          <p className="small muted">Uma cópia verificada dos dados, guardada neste computador. Restaurar volta os dados ao momento da cópia.</p>
          <RestorePoints onChanged={changed} refreshKey={refreshKey} />
        </section>

        <section className="card" aria-labelledby="titulo-cifrado">
          <div className="card-header">
            <h2 className="h-display" id="titulo-cifrado">
              Backup cifrado
            </h2>
          </div>
          <p className="small muted">Um arquivo protegido por senha, para guardar fora deste computador ou levar para outro. Inclui as chaves PIX cadastradas.</p>
          <EncryptedBackup onChanged={changed} />
        </section>

        <section className="card" aria-labelledby="titulo-exportar">
          <div className="card-header">
            <h2 className="h-display" id="titulo-exportar">
              Exportar dados
            </h2>
          </div>
          <Exports hasProfile={hasProfile} />
        </section>

        <section className="card" aria-labelledby="titulo-apagar">
          <div className="card-header">
            <h2 className="h-display" id="titulo-apagar">
              Apagar dados
            </h2>
          </div>
          <DeleteAll hasProfile={hasProfile} onChanged={changed} />
        </section>
      </div>
    </div>
  );
}
