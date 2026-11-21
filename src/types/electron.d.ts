export {};

/** Estado da conta Talentum no app para computador (electron/cloud-auth.cjs). Nunca traz token. */
type CloudAccountStatus = { available: boolean; connected: boolean; persistent: boolean; displayName: string | null };

type WindowButton = 'close' | 'minimize' | 'maximize';
/** Disposição dos botões lida da área de trabalho Linux (electron/window-chrome.cjs). */
type SystemButtonLayout = { side: 'left' | 'right'; buttons: WindowButton[]; source: string };
type WindowChrome = {
  platform: string;
  systemLayout: SystemButtonLayout | null;
  maximized: boolean;
  fullscreen: boolean;
};

declare global {
  interface Window {
    talentumWindow?: {
      minimize: () => void;
      toggleMaximize: () => void;
      close: () => void;
      chrome?: () => Promise<WindowChrome | null>;
      setTheme?: (theme: 'light' | 'dark') => void;
      onStateChange?: (callback: (state: { maximized: boolean; fullscreen: boolean }) => void) => () => void;
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
