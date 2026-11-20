'use client';

/* Portão do cofre local: nada do aplicativo é montado antes do desbloqueio.

   Enquanto o estado não é "desbloqueado", só as telas do cofre aparecem: sem
   barra lateral, sem cabeçalho e sem nenhuma tela que consulte dados. Assim
   não existe o instante em que um valor financeiro pisca antes do bloqueio.

   Com o cofre aberto, o portão relata a atividade real da pessoa (teclado,
   ponteiro, toque, rolagem) no máximo uma vez por minuto, o que adia o
   bloqueio automático no backend, e confere o estado a cada 30 segundos. Uma
   chamada que descubra o cofre fechado (`VAULT_LOCKED_EVENT`) traz a tela de
   desbloqueio na hora. */

import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { VAULT_LOCKED_EVENT } from '@/lib/api-client';
import { vault } from '@/lib/vault-client';
import { CheckingScreen, RecoverScreen, type RecoveryReason, RecoveryCodeScreen, SetupScreen, UnavailableScreen, UnlockScreen } from '@/components/vault-screens';

type View =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'setup'; hasExistingData: boolean }
  | { kind: 'locked'; totpEnabled: boolean; retryAfterSeconds: number }
  | { kind: 'recover'; totpEnabled: boolean }
  | { kind: 'recovery-code'; code: string; reason: RecoveryReason }
  | { kind: 'unlocked' };

const ACTIVITY_INTERVAL_MS = 60_000;
const STATUS_INTERVAL_MS = 30_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

type VaultControls = { lockNow: () => Promise<void> };
const VaultContext = createContext<VaultControls | null>(null);

export function useVaultControls() {
  return useContext(VaultContext);
}

export function VaultGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // A prévia da landing page em /lp é pública e não mostra dado nenhum.
  const bypass = pathname === '/lp' || pathname.startsWith('/lp/');
  const [view, setView] = useState<View>({ kind: 'checking' });
  const unlocked = view.kind === 'unlocked';

  const refresh = useCallback(async () => {
    try {
      const status = await vault.status();
      if (status.state === 'uninitialized') setView({ kind: 'setup', hasExistingData: status.hasExistingData });
      else if (status.state === 'locked') setView((current) => (current.kind === 'recover' ? current : { kind: 'locked', totpEnabled: status.totpEnabled, retryAfterSeconds: status.retryAfterSeconds }));
      else setView((current) => (current.kind === 'recovery-code' ? current : { kind: 'unlocked' }));
    } catch {
      setView({ kind: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    if (bypass) return;
    void refresh();
  }, [bypass, refresh]);

  // Qualquer chamada que encontre o cofre fechado volta para o desbloqueio.
  useEffect(() => {
    const onLocked = () => void refresh();
    window.addEventListener(VAULT_LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(VAULT_LOCKED_EVENT, onLocked);
  }, [refresh]);

  // Presença real adia o bloqueio automático; consultas automáticas da tela não contam.
  const active = useRef(false);
  useEffect(() => {
    if (!unlocked) return;
    const mark = () => {
      active.current = true;
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, mark, { passive: true });
    const activity = window.setInterval(() => {
      if (!active.current) return;
      active.current = false;
      vault.activity().catch(() => undefined);
    }, ACTIVITY_INTERVAL_MS);
    const status = window.setInterval(() => void refresh(), STATUS_INTERVAL_MS);
    // Ao voltar para a janela, confere logo: o prazo pode ter vencido em segundo plano.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, mark);
      window.clearInterval(activity);
      window.clearInterval(status);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [unlocked, refresh]);

  const lockNow = useCallback(async () => {
    try {
      await vault.lock();
    } finally {
      await refresh();
    }
  }, [refresh]);

  // No app para computador, suspender o sistema ou bloquear a tela também bloqueia o cofre.
  useEffect(() => {
    if (!unlocked) return;
    return window.talentumWindow?.onVaultLockRequest?.(() => void lockNow());
  }, [unlocked, lockNow]);

  const controls = useMemo(() => ({ lockNow }), [lockNow]);

  if (bypass) return <>{children}</>;

  switch (view.kind) {
    case 'checking':
      return <CheckingScreen />;
    case 'unavailable':
      return <UnavailableScreen onRetry={() => void refresh()} />;
    case 'setup':
      return <SetupScreen hasExistingData={view.hasExistingData} onCreated={(code) => setView({ kind: 'recovery-code', code, reason: 'setup' })} />;
    case 'locked':
      return (
        <UnlockScreen
          totpEnabled={view.totpEnabled}
          retryAfterSeconds={view.retryAfterSeconds}
          onUnlocked={(code) => setView(code ? { kind: 'recovery-code', code, reason: 'rotated' } : { kind: 'unlocked' })}
          onForgot={() => setView({ kind: 'recover', totpEnabled: view.totpEnabled })}
        />
      );
    case 'recover':
      return (
        <RecoverScreen
          totpEnabled={view.totpEnabled}
          onRecovered={(code) => setView({ kind: 'recovery-code', code, reason: 'recovered' })}
          onBack={() => setView({ kind: 'locked', totpEnabled: view.totpEnabled, retryAfterSeconds: 0 })}
        />
      );
    case 'recovery-code':
      return <RecoveryCodeScreen code={view.code} reason={view.reason} onDone={() => setView({ kind: 'unlocked' })} />;
    case 'unlocked':
      return <VaultContext.Provider value={controls}>{children}</VaultContext.Provider>;
  }
}

/** "Bloquear agora", no cabeçalho do aplicativo. */
export function LockNowButton() {
  const controls = useVaultControls();
  const [busy, setBusy] = useState(false);
  if (!controls) return null;
  return (
    <button
      type="button"
      className="icon-button"
      onClick={async () => {
        setBusy(true);
        try {
          await controls.lockNow();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      aria-label="Bloquear agora"
      title="Bloquear agora"
    >
      <i className="bi bi-lock" style={{ fontSize: 16 }} aria-hidden="true" />
    </button>
  );
}
