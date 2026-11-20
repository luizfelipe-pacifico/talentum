'use client';

/* Configurações > Segurança: senha, código de recuperação, aplicativo
   autenticador, bloqueio automático e conta Talentum (Google).

   Padrão: as páginas de segurança do 1Password, do Bitwarden e da conta
   Google, com uma seção por fator, o estado escrito por extenso e uma ação
   por seção. Toda ação que muda um fator pede a senha atual de novo. */

import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { assessPassword, passwordProblemMessage } from '@/lib/password-policy';
import { AUTO_LOCK_OPTIONS, type SecuritySettings as Settings, type TotpEnrollment, vault } from '@/lib/vault-client';
import { CodeField, PasswordField, RecoveryCodePanel, StrengthMeter } from '@/components/vault-screens';

function message(error: unknown, fallback: string) {
  return error instanceof ApiError && error.publicMessage ? error.publicMessage : fallback;
}

function InlineError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="vault-error" role="alert">
      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

function Done({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="security-done" role="status">
      <i className="bi bi-check-circle" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/* ── Senha ────────────────────────────────────────────────────── */

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const assessment = assessPassword(next);
    if (!current) return setError('Digite a senha atual.');
    if (!assessment.acceptable) return setError(passwordProblemMessage(assessment.problems[0] ?? 'TOO_SHORT'));
    if (next !== confirmation) return setError('As duas senhas novas não são iguais.');
    setBusy(true);
    setError(null);
    try {
      await vault.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirmation('');
      setOpen(false);
      setDone('Senha trocada. Use a senha nova no próximo desbloqueio.');
    } catch (caught) {
      setError(message(caught, 'Não foi possível trocar a senha. Nada foi alterado.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="security-password">
      <div className="card-header security-header">
        <h2 className="h-display" id="security-password">
          Senha do Talentum
        </h2>
      </div>
      <p className="small muted">A senha abre os dados deste computador. Trocar a senha não recifra nada: a chave dos seus dados passa a ser protegida pela senha nova, e a antiga deixa de funcionar.</p>
      <Done text={done} />
      {open ? (
        <form className="vault-form" onSubmit={submit} noValidate>
          <PasswordField label="Senha atual" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
          <PasswordField label="Senha nova" value={next} onChange={setNext} autoComplete="new-password" />
          <StrengthMeter password={next} />
          <PasswordField label="Repita a senha nova" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
          <InlineError text={error} />
          <div className="security-actions">
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Trocando a senha…' : 'Trocar senha'}
            </button>
            <button type="button" className="btn btn-neutral" onClick={() => { setOpen(false); setError(null); }}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="security-actions">
          <button type="button" className="btn" onClick={() => { setOpen(true); setDone(null); }}>
            Trocar senha
          </button>
        </div>
      )}
    </section>
  );
}

/* ── Código de recuperação ────────────────────────────────────── */

function RecoverySection({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const [step, setStep] = useState<'idle' | 'password' | 'code'>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!password) return setError('Digite a senha atual.');
    setBusy(true);
    setError(null);
    try {
      const result = await vault.regenerateRecoveryCode(password);
      setPassword('');
      setCode(result.recoveryCode);
      setStep('code');
      onChange();
    } catch (caught) {
      setError(message(caught, 'Não foi possível gerar o código. Nada foi alterado.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="security-recovery">
      <div className="card-header security-header">
        <h2 className="h-display" id="security-recovery">
          Código de recuperação
        </h2>
        <span className={`chip ${settings.recoveryConfirmed ? 'chip-ok' : 'chip-warn'}`}>
          <i className={`bi ${settings.recoveryConfirmed ? 'bi-check-circle' : 'bi-exclamation-circle'}`} aria-hidden="true" />
          {settings.recoveryConfirmed ? 'Guardado' : 'Guarda não confirmada'}
        </span>
      </div>
      <p className="small muted">Abre seus dados se você esquecer a senha. Gerar um novo código invalida o anterior na hora.</p>
      {step === 'idle' && (
        <div className="security-actions">
          <button type="button" className="btn" onClick={() => setStep('password')}>
            Gerar novo código
          </button>
        </div>
      )}
      {step === 'password' && (
        <form className="vault-form" onSubmit={generate} noValidate>
          <PasswordField label="Senha atual" value={password} onChange={setPassword} autoComplete="current-password" autoFocus hint="Gerar um código novo exige a senha, porque ele substitui o anterior." />
          <InlineError text={error} />
          <div className="security-actions">
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Gerando o código…' : 'Gerar novo código'}
            </button>
            <button type="button" className="btn btn-neutral" onClick={() => { setStep('idle'); setError(null); }}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {step === 'code' && (
        <RecoveryCodePanel
          code={code}
          confirmLabel="Concluir"
          onConfirmed={() => {
            setCode('');
            setStep('idle');
            onChange();
          }}
        />
      )}
    </section>
  );
}

/* ── Aplicativo autenticador ──────────────────────────────────── */

/** QR desenhado aqui, a partir da matriz devolvida pelo backend: nenhum serviço externo vê o segredo. */
function QrCode({ size, cells }: { size: number; cells: string }) {
  const quiet = 4;
  let path = '';
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (cells[row * size + column] === '1') path += `M${column + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  const total = size + quiet * 2;
  return (
    <svg className="security-qr" viewBox={`0 0 ${total} ${total}`} role="img" aria-label="QR para cadastrar o Talentum no aplicativo autenticador" shapeRendering="crispEdges">
      <rect width={total} height={total} fill="#fffdf8" />
      <path d={path} fill="#1a110a" />
    </svg>
  );
}

function TotpSection({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const [step, setStep] = useState<'idle' | 'password' | 'scan' | 'backup' | 'disable'>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const secretId = useId();

  const reset = () => {
    setStep('idle');
    setPassword('');
    setCode('');
    setEnrollment(null);
    setError(null);
  };

  async function run(task: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(message(caught, fallback));
    } finally {
      setBusy(false);
    }
  }

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!password) return setError('Digite a senha atual.');
    void run(async () => {
      setEnrollment(await vault.startTotp(password));
      setPassword('');
      setStep('scan');
    }, 'Não foi possível começar o cadastro. Nada foi alterado.');
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError('Digite os 6 números que aparecem no aplicativo autenticador.');
    void run(async () => {
      const result = await vault.confirmTotp(code.trim());
      setBackupCodes(result.backupCodes);
      setEnrollment(null);
      setCode('');
      setStep('backup');
      onChange();
    }, 'Não foi possível ativar o autenticador.');
  };

  const disable = (event: FormEvent) => {
    event.preventDefault();
    if (!password || !code.trim()) return setError('Digite a senha atual e o código do autenticador.');
    void run(async () => {
      await vault.disableTotp(password, code.trim());
      reset();
      setDone('Autenticador desativado. O desbloqueio volta a pedir só a senha.');
      onChange();
    }, 'Não foi possível desativar o autenticador.');
  };

  const status = settings.totpEnabled ? `Ativo · ${settings.backupCodesRemaining} ${settings.backupCodesRemaining === 1 ? 'código reserva' : 'códigos reserva'}` : 'Desativado';

  return (
    <section className="card" aria-labelledby="security-totp">
      <div className="card-header security-header">
        <h2 className="h-display" id="security-totp">
          Aplicativo autenticador
        </h2>
        <span className={`chip ${settings.totpEnabled ? 'chip-ok' : 'chip-info'}`}>
          <i className={`bi ${settings.totpEnabled ? 'bi-check-circle' : 'bi-dash-circle'}`} aria-hidden="true" />
          {status}
        </span>
      </div>
      <p className="small muted">
        Com o autenticador ativo, o desbloqueio pede a senha e o código de 6 números do aplicativo (Google Authenticator, Microsoft Authenticator, 1Password e outros). Ele impede que alguém com a sua senha abra o Talentum por esta tela; quem copiar o arquivo de dados ainda depende só da senha para tentar abri-lo.
      </p>
      <Done text={done} />

      {step === 'idle' && (
        <div className="security-actions">
          {settings.totpEnabled ? (
            <button type="button" className="btn btn-danger" onClick={() => { setStep('disable'); setDone(null); }}>
              Desativar autenticador
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => { setStep('password'); setDone(null); }}>
              Ativar autenticador
            </button>
          )}
        </div>
      )}

      {step === 'password' && (
        <form className="vault-form" onSubmit={start} noValidate>
          <PasswordField label="Senha atual" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
          <InlineError text={error} />
          <div className="security-actions">
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Preparando o cadastro…' : 'Mostrar QR do autenticador'}
            </button>
            <button type="button" className="btn btn-neutral" onClick={reset}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {step === 'scan' && enrollment && (
        <form className="vault-form" onSubmit={confirm} noValidate>
          <ol className="security-steps">
            <li>No aplicativo autenticador, adicione uma conta e leia o QR.</li>
            <li>Digite abaixo os 6 números que aparecerem para Talentum.</li>
          </ol>
          <div className="security-qr-row">
            <QrCode size={enrollment.qr.size} cells={enrollment.qr.cells} />
            <div className="security-secret">
              <p className="small muted" id={secretId}>
                Sem câmera? Digite esta chave no aplicativo, como “chave de configuração”:
              </p>
              <p className="security-secret-value" aria-describedby={secretId}>
                {enrollment.secret.match(/.{1,4}/g)?.join(' ')}
              </p>
            </div>
          </div>
          <CodeField label="Código do autenticador" value={code} onChange={setCode} mode="totp" hint="Os 6 números que aparecem agora no aplicativo." autoFocus />
          <InlineError text={error} />
          <div className="security-actions">
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Ativando…' : 'Ativar autenticador'}
            </button>
            <button type="button" className="btn btn-neutral" onClick={reset}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {step === 'backup' && (
        <div className="vault-form">
          <p className="security-done" role="status">
            <i className="bi bi-check-circle" aria-hidden="true" />
            <span>Autenticador ativo. O próximo desbloqueio pede a senha e o código.</span>
          </p>
          <p className="small">Guarde estes códigos reserva. Cada um vale uma vez, no lugar do código do aplicativo, se você perder o celular. Eles aparecem só agora.</p>
          <ul className="security-backup">
            {backupCodes.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
          <div className="security-actions">
            <button type="button" className="btn btn-neutral" onClick={() => navigator.clipboard.writeText(backupCodes.join('\n')).catch(() => undefined)}>
              <i className="bi bi-copy" aria-hidden="true" /> Copiar códigos reserva
            </button>
            <button type="button" className="btn btn-primary" onClick={() => { setBackupCodes([]); reset(); }}>
              Guardei os códigos reserva
            </button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <form className="vault-form" onSubmit={disable} noValidate>
          <PasswordField label="Senha atual" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
          <CodeField label="Código do autenticador" value={code} onChange={setCode} mode="totp" hint="Os 6 números do aplicativo, ou um código reserva." />
          <InlineError text={error} />
          <div className="security-actions">
            <button type="submit" className="btn btn-danger" disabled={busy} aria-busy={busy}>
              {busy ? 'Desativando…' : 'Desativar autenticador'}
            </button>
            <button type="button" className="btn btn-neutral" onClick={reset}>
              Manter ativo
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ── Bloqueio automático ──────────────────────────────────────── */

function AutoLockSection({ settings, onSaved }: { settings: Settings; onSaved: (settings: Settings) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const id = useId();

  async function change(minutes: number) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      onSaved(await vault.setAutoLock(minutes));
      setDone(`O Talentum bloqueia depois de ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} sem uso.`);
    } catch (caught) {
      setError(message(caught, 'Não foi possível salvar o tempo. O anterior continua valendo.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="security-autolock">
      <div className="card-header security-header">
        <h2 className="h-display" id="security-autolock">
          Bloqueio automático
        </h2>
      </div>
      <p className="small muted">Sem teclado, mouse ou toque por esse tempo, o Talentum fecha os dados e pede a senha de novo. Use Bloquear agora, no topo da tela, para fechar na hora.</p>
      <label className="field" htmlFor={id}>
        Bloquear depois de
        <select id={id} value={settings.autoLockMinutes} disabled={busy} onChange={(event) => void change(Number(event.target.value))}>
          {AUTO_LOCK_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} {minutes === 1 ? 'minuto' : 'minutos'} sem uso
            </option>
          ))}
        </select>
      </label>
      <InlineError text={error} />
      <Done text={done} />
    </section>
  );
}

/* ── Conta Talentum (Google) ──────────────────────────────────── */

type CloudStatus = { available: boolean; connected: boolean; persistent: boolean; displayName: string | null };

function CloudAccountSection() {
  const bridge = typeof window !== 'undefined' ? window.talentumWindow?.cloudAccount : undefined;
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    bridge.status().then(setStatus, () => setStatus(null));
  }, [bridge]);

  async function act(action: 'signIn' | 'signOut') {
    if (!bridge || busy) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await bridge[action]());
    } catch {
      setError(action === 'signIn' ? 'Não foi possível entrar com Google. Confira a conexão e tente de novo.' : 'Não foi possível sair da conta. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const connected = status?.connected ?? false;
  return (
    <section className="card" aria-labelledby="security-cloud">
      <div className="card-header security-header">
        <h2 className="h-display" id="security-cloud">
          Conta Talentum
        </h2>
        <span className={`chip ${connected ? 'chip-ok' : 'chip-info'}`}>
          <i className={`bi ${connected ? 'bi-check-circle' : 'bi-dash-circle'}`} aria-hidden="true" />
          {connected ? 'Conectada' : 'Não conectada'}
        </span>
      </div>
      <p className="small muted">A conta Talentum serve para downloads, atualizações e comunidade. Entrar com Google não desbloqueia os dados deste computador: só a senha ou o código de recuperação fazem isso, e nenhuma chave dos seus dados vai para a internet.</p>
      {!bridge ? (
        <p className="small">Disponível no aplicativo para computador.</p>
      ) : status && !status.available ? (
        <p className="small">Esta versão do aplicativo ainda não se conecta à conta Talentum. Os dados deste computador funcionam normalmente sem ela.</p>
      ) : (
        <>
          {connected && status?.displayName && <p className="small">Conectada como {status.displayName}.</p>}
          {connected && status && !status.persistent && <p className="small muted">Este sistema não oferece um cofre de credenciais; a conexão dura até fechar o aplicativo.</p>}
          <InlineError text={error} />
          <div className="security-actions">
            {connected ? (
              <button type="button" className="btn" onClick={() => void act('signOut')} disabled={busy} aria-busy={busy}>
                Sair da conta Talentum
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => void act('signIn')} disabled={busy} aria-busy={busy}>
                <i className="bi bi-google" aria-hidden="true" />
                {busy ? 'Aguardando o navegador…' : 'Entrar com Google'}
              </button>
            )}
          </div>
          {!connected && <p className="small muted">Ao continuar, você aceita os Termos de Uso e declara ter lido a Política de Privacidade da conta Talentum, publicados no site do Talentum.</p>}
          {busy && <p className="small muted">O login abre no navegador do sistema. Volte para o Talentum depois de entrar.</p>}
        </>
      )}
    </section>
  );
}

/* ── Página ───────────────────────────────────────────────────── */

export function SecuritySettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    vault.settings().then(setSettings, () => setFailed(true));
  }, []);

  useEffect(load, [load]);

  if (failed) {
    return (
      <section className="card error-strip">
        <p>Não foi possível consultar as configurações de segurança. Nada foi alterado.</p>
        <button type="button" className="btn" onClick={load}>
          Tentar novamente
        </button>
      </section>
    );
  }
  if (!settings) {
    return (
      <p className="small muted" role="status">
        Carregando as configurações de segurança…
      </p>
    );
  }
  return (
    <div className="settings-grid security-grid">
      <PasswordSection />
      <RecoverySection settings={settings} onChange={load} />
      <TotpSection settings={settings} onChange={load} />
      <AutoLockSection settings={settings} onSaved={setSettings} />
      <CloudAccountSection />
    </div>
  );
}
