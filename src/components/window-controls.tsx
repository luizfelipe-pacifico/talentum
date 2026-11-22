'use client';

/* Controles da janela do app para computador.

   macOS e Windows usam os botões nativos (electron/window-chrome.cjs); aqui só
   ficam o estado da janela e, no Linux, os botões desenhados no lado e na ordem
   que a área de trabalho ou a pessoa escolheu (src/lib/window-layout.ts). */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_WINDOW_PREFERENCES,
  parseWindowPreferences,
  resolveLayout,
  type SidePreference,
  type StylePreference,
  WINDOW_PREFERENCES_KEY,
  type WindowButton,
  type WindowPreferences,
} from '@/lib/window-layout';
import { setWindowSurface } from '@/lib/window-surface';

type Chrome = NonNullable<Awaited<ReturnType<NonNullable<NonNullable<Window['talentumWindow']>['chrome']>>>>;

let chromeRequest: Promise<Chrome | null> | null = null;
function loadChrome(): Promise<Chrome | null> {
  chromeRequest ??= window.talentumWindow?.chrome?.().catch(() => null) ?? Promise.resolve(null);
  return chromeRequest;
}

const PREFERENCES_EVENT = 'talentum:janela';

function readPreferences(): WindowPreferences {
  try {
    return parseWindowPreferences(window.localStorage.getItem(WINDOW_PREFERENCES_KEY));
  } catch {
    return DEFAULT_WINDOW_PREFERENCES;
  }
}

let cachedPreferences: WindowPreferences | null = null;
function subscribePreferences(onChange: () => void) {
  const listener = () => {
    cachedPreferences = readPreferences();
    onChange();
  };
  window.addEventListener(PREFERENCES_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(PREFERENCES_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
function preferencesSnapshot() {
  cachedPreferences ??= readPreferences();
  return cachedPreferences;
}

export function saveWindowPreferences(next: WindowPreferences) {
  try {
    window.localStorage.setItem(WINDOW_PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Sem armazenamento a escolha vale só nesta sessão.
  }
  cachedPreferences = next;
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}

export function useWindowPreferences() {
  return useSyncExternalStore(subscribePreferences, preferencesSnapshot, () => DEFAULT_WINDOW_PREFERENCES);
}

/** Sistema e estado da janela; `null` fora do app para computador. */
export function useWindowChrome() {
  const [chrome, setChrome] = useState<Chrome | null>(null);
  useEffect(() => {
    let active = true;
    void loadChrome().then((value) => {
      if (active) setChrome(value);
    });
    const unsubscribe = window.talentumWindow?.onStateChange?.((state) => setChrome((current) => (current ? { ...current, ...state } : current)));
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  return chrome;
}

/** Marca o estado da janela no <html>: o recuo dos botões do macOS some em tela cheia.
    Montado só com o app aberto, também diz ao Windows que há barra superior sob os botões. */
export function WindowStateClasses() {
  const chrome = useWindowChrome();
  useEffect(() => {
    setWindowSurface('bar');
    return () => setWindowSurface('page');
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('window-fullscreen', Boolean(chrome?.fullscreen));
    root.classList.toggle('window-maximized', Boolean(chrome?.maximized));
  }, [chrome?.fullscreen, chrome?.maximized]);
  return null;
}

const LABELS: Record<WindowButton, string> = { close: 'Fechar', minimize: 'Minimizar', maximize: 'Maximizar' };

function buttonIcon(name: WindowButton, maximized: boolean) {
  if (name === 'close') return 'bi-x-lg';
  if (name === 'minimize') return 'bi-dash-lg';
  return maximized ? 'bi-window-stack' : 'bi-square';
}

/** Botões desenhados do Linux, no início ou no fim da barra superior. */
export function WindowControls({ position }: { position: 'start' | 'end' }) {
  const chrome = useWindowChrome();
  const preferences = useWindowPreferences();
  const act = useCallback((name: WindowButton) => {
    if (name === 'close') window.talentumWindow?.close();
    else if (name === 'minimize') window.talentumWindow?.minimize();
    else window.talentumWindow?.toggleMaximize();
  }, []);

  if (chrome?.platform !== 'linux') return null;
  const layout = resolveLayout(chrome.systemLayout, preferences);
  if ((layout.side === 'left') !== (position === 'start')) return null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset groups form fields; these are window buttons outside any form
    <div className={`window-controls window-controls-${layout.side} window-controls-${layout.style}`} role="group" aria-label="Controles da janela">
      {layout.buttons.map((name) => {
        const label = name === 'maximize' && chrome.maximized ? 'Restaurar' : LABELS[name];
        return (
          <button key={name} type="button" className={`window-button window-button-${name}`} onClick={() => act(name)} aria-label={label} title={label}>
            <i className={`bi ${buttonIcon(name, chrome.maximized)}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

const SIDE_OPTIONS: { value: SidePreference; label: string }[] = [
  { value: 'sistema', label: 'Igual ao sistema' },
  { value: 'esquerda', label: 'Esquerda' },
  { value: 'direita', label: 'Direita' },
];
const STYLE_OPTIONS: { value: StylePreference; label: string; description: string }[] = [
  { value: 'discreto', label: 'Discretos', description: 'Ícones na cor do texto, como no GNOME e no KDE.' },
  { value: 'colorido', label: 'Coloridos', description: 'Círculos vermelho, amarelo e verde, como no macOS.' },
];

/** Preferências dos botões da janela; só aparecem no app para Linux. */
export function WindowPreferencesCard() {
  const chrome = useWindowChrome();
  const preferences = useWindowPreferences();
  if (chrome?.platform !== 'linux') return null;
  const system = chrome.systemLayout;
  const systemSide = system?.side === 'left' ? 'à esquerda' : 'à direita';

  return (
    <section className="card" aria-labelledby="titulo-janela">
      <div className="card-header">
        <h2 className="h-display" id="titulo-janela">
          Botões da janela
        </h2>
      </div>
      <div className="stack">
        <label className="field">
          Posição
          <select value={preferences.side} onChange={(event) => saveWindowPreferences({ ...preferences, side: event.target.value as SidePreference })}>
            {SIDE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value === 'sistema' ? `${option.label} (${systemSide})` : option.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="field-group">
          <legend>Estilo</legend>
          {STYLE_OPTIONS.map((option) => (
            <label key={option.value} className="check-field">
              <input
                type="radio"
                name="estilo-botoes"
                value={option.value}
                checked={preferences.style === option.value}
                onChange={() => saveWindowPreferences({ ...preferences, style: option.value })}
              />
              <span>
                <strong>{option.label}</strong>
                <br />
                <span className="small muted">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="small muted">A mudança vale na hora, sem reiniciar o Talentum.</p>
      </div>
    </section>
  );
}
