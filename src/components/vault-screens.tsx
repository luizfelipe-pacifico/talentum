'use client';

/* Telas do cofre local: primeiro uso, desbloqueio, recuperação e código de recuperação.

   Padrão seguido: a tela de bloqueio do macOS e as do 1Password e do Bitwarden
   (uma coluna centrada, a marca, um campo de senha e um único botão principal,
   com "Esqueci a senha" como caminho secundário), e o código de recuperação
   como o kit de emergência do 1Password e os códigos do GitHub: mostrado uma
   vez, com copiar e uma confirmação explícita antes de seguir. Registro em
   docs/DESIGN-SYSTEM.md, "Lock and first-run screens". */

import Image from 'next/image';
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { StateArt } from '@/components/state-art';
import { assessPassword, PASSWORD_MIN_LENGTH, passwordProblemMessage } from '@/lib/password-policy';
import { vault } from '@/lib/vault-client';
import logoDark from '../../icon-talentum-dark.svg';
import logoLight from '../../icon-talentum-light.svg';

/* ── Peças comuns ─────────────────────────────────────────────── */

export function LockLayout({ eyebrow, title, children, wide = false, art = false }: { eyebrow?: string; title: string; children: ReactNode; wide?: boolean; art?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Cada passo novo leva o foco ao título: leitor de tela anuncia onde a pessoa está.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the title is the trigger for moving focus to the new step
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <main className={`vault-screen${wide ? ' vault-screen-wide' : ''}`}>
      <div className="vault-panel">
        <div className="vault-brand" aria-hidden="true">
          {/* Marca escura sobre o fundo claro e clara sobre o escuro; o CSS mostra só a do tema ativo. */}
          <span className="brand-symbol vault-logo-light">
            <Image className="brand-logo" src={logoLight} alt="" priority unoptimized />
          </span>
          <span className="brand-symbol vault-logo-dark">
            <Image className="brand-logo" src={logoDark} alt="" priority unoptimized />
          </span>
          <span className="vault-wordmark">Talentum</span>
        </div>
        {/* O cofre trancado diz, antes de qualquer frase, que os dados estão guardados
            e pedem a chave. Só no primeiro uso e no desbloqueio; os passos de código
            e recuperação já são longos. Decorativa: o texto se sustenta sozinho. */}
        {art && (
          <div className="vault-art">
            <StateArt name="cofre-trancado" size="sm" />
          </div>
        )}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="vault-title" ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="vault-field">
      <label htmlFor={id}>{label}</label>
      <div className="vault-input-row">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={1024}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          // biome-ignore lint/a11y/noAutofocus: the lock screen has a single task; focusing the password is what macOS and password managers do
          autoFocus={autoFocus}
        />
        <button type="button" className="vault-reveal" onClick={() => setVisible((current) => !current)} aria-pressed={visible} aria-controls={id} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}>
          <i className={`bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="vault-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="vault-field-error">
          <i className="bi bi-exclamation-circle" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}

export function CodeField({ label, value, onChange, hint, autoFocus = false, mode }: { label: string; value: string; onChange: (value: string) => void; hint: string; autoFocus?: boolean; mode: 'totp' | 'recovery' }) {
  const id = useId();
  return (
    <div className="vault-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="vault-code-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="text"
        autoComplete={mode === 'totp' ? 'one-time-code' : 'off'}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={mode === 'totp' ? 12 : 48}
        aria-describedby={`${id}-hint`}
        // biome-ignore lint/a11y/noAutofocus: focus moves to the only field of this step
        autoFocus={autoFocus}
      />
      <p id={`${id}-hint`} className="vault-hint">
        {hint}
      </p>
    </div>
  );
}

const STRENGTH_TONE = ['err', 'err', 'warn', 'ok', 'ok'] as const;

export function StrengthMeter({ password, showProblem = true }: { password: string; showProblem?: boolean }) {
  if (!password) return null;
  const assessment = assessPassword(password);
  const problem = assessment.problems[0];
  return (
    <div className="vault-strength" data-tone={STRENGTH_TONE[assessment.score]}>
      <div className="vault-strength-bar" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} data-filled={index < assessment.score ? 'true' : 'false'} />
        ))}
      </div>
      <p className="vault-strength-label" aria-live="polite">
        Força da senha: <strong>{assessment.label}</strong>
        {problem && showProblem && <span className="vault-strength-problem">. {passwordProblemMessage(problem)}</span>}
      </p>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="vault-error" role="alert">
      <i className="bi bi-exclamation-triangle" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.publicMessage) return error.publicMessage;
  return fallback;
}

/** Contagem regressiva do atraso entre tentativas, em "m:ss". */
function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => setSeconds(initialSeconds), [initialSeconds]);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  return [seconds, setSeconds] as const;
}

function clock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function newPasswordProblem(password: string, confirmation: string): { field: 'password' | 'confirmation'; message: string } | null {
  const assessment = assessPassword(password);
  if (!assessment.acceptable) return { field: 'password', message: passwordProblemMessage(assessment.problems[0] ?? 'TOO_SHORT') };
  if (password !== confirmation) return { field: 'confirmation', message: 'As duas senhas não são iguais. Digite a mesma senha nos dois campos.' };
  return null;
}

const PASSWORD_HINT = `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres. Uma frase com quatro palavras é fácil de lembrar e difícil de adivinhar.`;

/* ── Primeiro uso ─────────────────────────────────────────────── */

export function SetupScreen({ hasExistingData, onCreated }: { hasExistingData: boolean; onCreated: (recoveryCode: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = submitted ? newPasswordProblem(password, confirmation) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (busy || newPasswordProblem(password, confirmation)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await vault.setup(password);
      setPassword('');
      setConfirmation('');
      onCreated(result.recoveryCode);
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível criar a senha. Nada foi alterado. Tente de novo.'));
      setBusy(false);
    }
  }

  return (
    <LockLayout eyebrow="Proteção dos dados · passo 1 de 2" title="Proteja seus dados" art>
      <p className="vault-lead">Crie a senha que abre o Talentum neste computador. Seus dados financeiros ficam cifrados e só podem ser lidos com essa senha ou com o código de recuperação que você recebe no próximo passo.</p>
      {hasExistingData && (
        <p className="vault-note">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span>Os dados que você já cadastrou continuam aqui. Eles passam a ser cifrados com a nova senha.</span>
        </p>
      )}
      <form className="vault-form" onSubmit={submit} noValidate>
        <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="new-password" hint={PASSWORD_HINT} error={problem?.field === 'password' ? problem.message : null} autoFocus />
        <StrengthMeter password={password} showProblem={!problem} />
        <PasswordField label="Repita a senha" value={confirmation} onChange={setConfirmation} autoComplete="new-password" error={problem?.field === 'confirmation' ? problem.message : null} />
        <p className="vault-warning">
          <i className="bi bi-shield-lock" aria-hidden="true" />
          <span>Sem a senha e sem o código de recuperação, ninguém consegue abrir seus dados, nem o Talentum. Não existe recuperação pela internet.</span>
        </p>
        <FormError message={error} />
        <button type="submit" className="btn btn-primary vault-submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Cifrando seus dados…' : 'Criar senha e cifrar dados'}
        </button>
      </form>
    </LockLayout>
  );
}

/* ── Código de recuperação ────────────────────────────────────── */

const RECOVERY_COPY = {
  setup: {
    eyebrow: 'Proteção dos dados · passo 2 de 2',
    title: 'Guarde o código de recuperação',
    lead: 'Se você esquecer a senha, este código é o único jeito de abrir seus dados. Ele aparece só agora.',
  },
  rotated: {
    eyebrow: 'Código de recuperação novo',
    title: 'Guarde o novo código de recuperação',
    lead: 'O código anterior não teve a guarda confirmada e deixou de valer. Este novo código aparece só agora.',
  },
  recovered: {
    eyebrow: 'Senha nova ativa',
    title: 'Guarde o novo código de recuperação',
    lead: 'O código que você usou deixou de valer. Este novo código substitui o anterior e aparece só agora.',
  },
  regenerated: {
    eyebrow: 'Código de recuperação novo',
    title: 'Guarde o novo código de recuperação',
    lead: 'O código anterior deixou de valer. Este novo código aparece só agora.',
  },
} as const;

export type RecoveryReason = keyof typeof RECOVERY_COPY;

export function RecoveryCodePanel({ code, onConfirmed, confirmLabel }: { code: string; onConfirmed: () => Promise<void> | void; confirmLabel: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkboxId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
      setError('Não foi possível copiar. Selecione o código e anote à mão.');
    }
  }

  async function confirm() {
    if (!saved || busy) return;
    setBusy(true);
    setError(null);
    try {
      await vault.confirmRecoveryCode();
      await onConfirmed();
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível registrar a confirmação. Tente de novo.'));
      setBusy(false);
    }
  }

  return (
    <div className="vault-form">
      <p className="vault-code">
        {code.split('-').map((group, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: groups are positional and the code never reorders
          <span key={index}>{group}</span>
        ))}
      </p>
      <button type="button" className="btn btn-neutral vault-copy" onClick={copy}>
        <i className={`bi ${copied ? 'bi-check2' : 'bi-copy'}`} aria-hidden="true" />
        {copied ? 'Código copiado' : 'Copiar código'}
      </button>
      <p className="vault-hint">Anote em papel ou guarde em um gerenciador de senhas, fora deste computador. Quem tiver o código consegue trocar a sua senha.</p>
      <label className="vault-check" htmlFor={checkboxId}>
        <input id={checkboxId} type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
        <span>Guardei o código de recuperação em um lugar seguro</span>
      </label>
      <FormError message={error} />
      <button type="button" className="btn btn-primary vault-submit" onClick={confirm} disabled={!saved || busy} aria-busy={busy}>
        {confirmLabel}
      </button>
    </div>
  );
}

export function RecoveryCodeScreen({ code, reason, onDone }: { code: string; reason: RecoveryReason; onDone: () => void }) {
  const copy = RECOVERY_COPY[reason];
  return (
    <LockLayout eyebrow={copy.eyebrow} title={copy.title}>
      <p className="vault-lead">{copy.lead}</p>
      <RecoveryCodePanel code={code} onConfirmed={onDone} confirmLabel="Abrir o Talentum" />
    </LockLayout>
  );
}

/* ── Desbloqueio ──────────────────────────────────────────────── */

export function UnlockScreen({
  totpEnabled,
  retryAfterSeconds,
  onUnlocked,
  onForgot,
}: {
  totpEnabled: boolean;
  retryAfterSeconds: number;
  onUnlocked: (rotatedRecoveryCode: string | null) => void;
  onForgot: () => void;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useCountdown(retryAfterSeconds);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || wait > 0) return;
    if (!password) {
      setError('Digite a senha.');
      return;
    }
    if (totpEnabled && !code.trim()) {
      setError('Digite o código do aplicativo autenticador.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await vault.unlock(password, totpEnabled ? code.trim() : undefined);
      setPassword('');
      onUnlocked(result.recoveryCode);
    } catch (caught) {
      if (caught instanceof ApiError && caught.retryAfterSeconds) setWait(caught.retryAfterSeconds);
      setError(errorMessage(caught, 'Não foi possível desbloquear. Tente de novo.'));
      setCode('');
      setBusy(false);
    }
  }

  return (
    <LockLayout title="Desbloquear o Talentum" art>
      <p className="vault-lead">{totpEnabled ? 'Digite a senha deste computador e o código do aplicativo autenticador.' : 'Digite a senha deste computador para ver seus dados.'}</p>
      <form className="vault-form" onSubmit={submit} noValidate>
        <PasswordField label="Senha" value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
        {totpEnabled && <CodeField label="Código do autenticador" value={code} onChange={setCode} mode="totp" hint="Os 6 números que aparecem agora no aplicativo. Sem o celular, use um código reserva." />}
        {wait > 0 ? (
          <p className="vault-error" role="status">
            <i className="bi bi-hourglass-split" aria-hidden="true" />
            <span>Muitas tentativas erradas. Tente de novo em {clock(wait)}.</span>
          </p>
        ) : (
          <FormError message={error} />
        )}
        <button type="submit" className="btn btn-primary vault-submit" disabled={busy || wait > 0} aria-busy={busy}>
          {busy ? 'Desbloqueando…' : 'Desbloquear'}
        </button>
      </form>
      <button type="button" className="btn-quiet vault-secondary" onClick={onForgot}>
        Esqueci a senha
      </button>
    </LockLayout>
  );
}

/* ── Recuperação ──────────────────────────────────────────────── */

export function RecoverScreen({ totpEnabled, onRecovered, onBack }: { totpEnabled: boolean; onRecovered: (recoveryCode: string) => void; onBack: () => void }) {
  const [recoveryCode, setRecoveryCode] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useCountdown(0);
  const problem = submitted ? newPasswordProblem(password, confirmation) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (busy || wait > 0) return;
    if (!recoveryCode.trim()) {
      setError('Digite o código de recuperação.');
      return;
    }
    if (newPasswordProblem(password, confirmation)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await vault.recover(recoveryCode.trim(), password, totpEnabled ? code.trim() : undefined);
      setPassword('');
      setConfirmation('');
      onRecovered(result.recoveryCode);
    } catch (caught) {
      if (caught instanceof ApiError && caught.retryAfterSeconds) setWait(caught.retryAfterSeconds);
      setError(errorMessage(caught, 'Não foi possível recuperar o acesso. Tente de novo.'));
      setBusy(false);
    }
  }

  return (
    <LockLayout eyebrow="Senha esquecida" title="Recuperar acesso">
      <p className="vault-lead">Digite o código de recuperação que você guardou ao criar a senha e escolha uma senha nova.</p>
      <form className="vault-form" onSubmit={submit} noValidate>
        <CodeField label="Código de recuperação" value={recoveryCode} onChange={setRecoveryCode} mode="recovery" hint="32 letras e números, com ou sem hífens." autoFocus />
        {totpEnabled && <CodeField label="Código do autenticador" value={code} onChange={setCode} mode="totp" hint="Os 6 números do aplicativo, ou um código reserva." />}
        <PasswordField label="Senha nova" value={password} onChange={setPassword} autoComplete="new-password" hint={PASSWORD_HINT} error={problem?.field === 'password' ? problem.message : null} />
        <StrengthMeter password={password} showProblem={!problem} />
        <PasswordField label="Repita a senha nova" value={confirmation} onChange={setConfirmation} autoComplete="new-password" error={problem?.field === 'confirmation' ? problem.message : null} />
        {wait > 0 ? (
          <p className="vault-error" role="status">
            <i className="bi bi-hourglass-split" aria-hidden="true" />
            <span>Muitas tentativas erradas. Tente de novo em {clock(wait)}.</span>
          </p>
        ) : (
          <FormError message={error} />
        )}
        <button type="submit" className="btn btn-primary vault-submit" disabled={busy || wait > 0} aria-busy={busy}>
          {busy ? 'Recuperando o acesso…' : 'Definir senha nova e desbloquear'}
        </button>
      </form>
      <button type="button" className="btn-quiet vault-secondary" onClick={onBack}>
        Voltar para o desbloqueio
      </button>
      <p className="vault-hint vault-footnote">Sem a senha e sem o código de recuperação, os dados deste computador não podem ser abertos por ninguém.</p>
    </LockLayout>
  );
}

/* ── Estados de espera e falha ────────────────────────────────── */

export function CheckingScreen() {
  return (
    <main className="vault-screen" aria-busy="true">
      <p className="vault-checking" role="status">
        Verificando o bloqueio do Talentum…
      </p>
    </main>
  );
}

export function UnavailableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <LockLayout title="Não foi possível verificar o bloqueio">
      <p className="vault-lead">O Talentum não respondeu. Nada foi alterado nos seus dados.</p>
      <button type="button" className="btn btn-primary vault-submit" onClick={onRetry}>
        Tentar de novo
      </button>
    </LockLayout>
  );
}
