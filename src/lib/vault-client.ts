/* Contratos do cofre local vistos pela interface (docs/ARCHITECTURE.md §4.8).
   Toda chamada passa pelo protocolo de código de ação de src/lib/api-client.ts. */

import { getJson, patchJson, postJson } from '@/lib/api-client';

export type VaultStatus = {
  state: 'uninitialized' | 'locked' | 'unlocked';
  totpEnabled: boolean;
  retryAfterSeconds: number;
  hasExistingData: boolean;
};

export type SecuritySettings = {
  autoLockMinutes: number;
  recoveryConfirmed: boolean;
  totpEnabled: boolean;
  backupCodesRemaining: number;
};

export type TotpEnrollment = { secret: string; qr: { size: number; cells: string } };

export const vault = {
  status: (signal?: AbortSignal) => getJson<VaultStatus>('/api/vault/status', signal),
  setup: (password: string) => postJson<{ recoveryCode: string; migratedExistingData: boolean }>('/api/vault/setup', { password }),
  unlock: (password: string, code?: string) => postJson<{ unlocked: true; recoveryCode: string | null }>('/api/vault/unlock', code ? { password, code } : { password }),
  recover: (recoveryCode: string, newPassword: string, code?: string) =>
    postJson<{ unlocked: true; recoveryCode: string }>('/api/vault/recover', code ? { recoveryCode, newPassword, code } : { recoveryCode, newPassword }),
  lock: () => postJson<{ locked: true }>('/api/vault/lock', {}),
  activity: () => postJson<{ secondsUntilAutoLock: number }>('/api/vault/activity', {}),
  settings: (signal?: AbortSignal) => getJson<SecuritySettings>('/api/vault/settings', signal),
  setAutoLock: (autoLockMinutes: number) => patchJson<SecuritySettings>('/api/vault/settings', { autoLockMinutes }),
  changePassword: (currentPassword: string, newPassword: string) => postJson<{ changed: true }>('/api/vault/password', { currentPassword, newPassword }),
  regenerateRecoveryCode: (password: string) => postJson<{ recoveryCode: string }>('/api/vault/recovery-code', { password }),
  confirmRecoveryCode: () => postJson<{ confirmed: true }>('/api/vault/recovery-code/confirm', {}),
  startTotp: (password: string) => postJson<TotpEnrollment>('/api/vault/totp', { password }),
  confirmTotp: (code: string) => postJson<{ backupCodes: string[] }>('/api/vault/totp/confirm', { code }),
  disableTotp: (password: string, code: string) => postJson<{ disabled: true }>('/api/vault/totp/disable', { password, code }),
};

/** Opções do bloqueio automático: valores que a pessoa reconhece, dentro do limite de 1 a 60 minutos. */
export const AUTO_LOCK_OPTIONS = [1, 2, 5, 10, 15, 30, 60] as const;
