export {};

/** Estado da conta Talentum no app para computador (electron/cloud-auth.cjs). Nunca traz token. */
type CloudAccountStatus = { available: boolean; connected: boolean; persistent: boolean; displayName: string | null };

declare global {
  interface Window {
    talentumWindow?: {
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      bootstrapSecret: () => Promise<string | null>;
      installUpdate?: (version: string) => Promise<{ status: 'installing' | 'refused' | 'failed' | 'busy' | 'unsupported-platform'; reason?: string }>;
      cloudAccount?: {
        status: () => Promise<CloudAccountStatus>;
        signIn: () => Promise<CloudAccountStatus>;
        signOut: () => Promise<CloudAccountStatus>;
      };
      /** Suspensão ou bloqueio de tela do sistema. Devolve a função que cancela a inscrição. */
      onVaultLockRequest?: (callback: () => void) => () => void;
    };
  }
}
