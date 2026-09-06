'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'Claro' | 'Escuro' | 'Sistema';
export type OverlayName = 'notif' | 'express' | 'import' | 'onboarding' | 'conta';

const THEME_KEY = 'talentum:tema';

type AppState = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;

  survival: boolean;
  toggleSurvival: () => void;
  offline: boolean;
  toggleOffline: () => void;

  contaIndex: number;
  setContaIndex: (index: number) => void;

  collapsed: boolean;
  toggleCollapsed: () => void;

  overlay: OverlayName | null;
  open: (name: OverlayName) => void;
  close: () => void;

  importStep: number;
  setImportStep: (step: number) => void;
  openImport: () => void;
};

const Context = createContext<AppState | null>(null);

function readStoredTheme(): ThemeMode {
  // Claro é o tema padrão do projeto: sem escolha salva, a interface abre clara.
  if (typeof window === 'undefined') return 'Claro';
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'Claro' || stored === 'Escuro' || stored === 'Sistema') return stored;
  } catch {
    // Armazenamento indisponível (janela privada, site data bloqueado): usa o padrão.
  }
  return 'Claro';
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('Claro');
  const [survival, setSurvival] = useState(false);
  const [offline, setOffline] = useState(false);
  const [contaIndex, setContaIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [overlay, setOverlay] = useState<OverlayName | null>(null);
  const [importStep, setImportStep] = useState(1);

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  // Aplica o tema e acompanha a preferência do sistema quando o modo é "Sistema".
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'Escuro' || (theme === 'Sistema' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    try {
      window.localStorage.setItem(THEME_KEY, mode);
    } catch {
      // Preferência não persiste neste contexto; a sessão atual continua correta.
    }
  }, []);

  const close = useCallback(() => setOverlay(null), []);

  const open = useCallback((name: OverlayName) => setOverlay(name), []);

  const openImport = useCallback(() => {
    setImportStep(1);
    setOverlay('import');
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      theme,
      setTheme,
      survival,
      toggleSurvival: () => setSurvival((current) => !current),
      offline,
      toggleOffline: () => setOffline((current) => !current),
      contaIndex,
      setContaIndex,
      collapsed,
      toggleCollapsed: () => setCollapsed((current) => !current),
      overlay,
      open,
      close,
      importStep,
      setImportStep,
      openImport,
    }),
    [theme, setTheme, survival, offline, contaIndex, collapsed, overlay, open, close, importStep, openImport],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('useApp precisa estar dentro de AppStateProvider.');
  return value;
}
