/* Disposição dos botões da janela no Linux (docs/DESIGN-SYSTEM.md, "Window controls").

   No macOS e no Windows os botões são os nativos e nada aqui se aplica. No Linux
   a área de trabalho define lado, ordem e quais botões existem (o GNOME, por
   padrão, mostra só fechar); a pessoa pode seguir o sistema ou fixar um lado, e
   escolher o estilo discreto ou o colorido do macOS. */

export type WindowButton = 'close' | 'minimize' | 'maximize';
export type ButtonSide = 'left' | 'right';
export type SidePreference = 'sistema' | 'esquerda' | 'direita';
export type StylePreference = 'discreto' | 'colorido';
export type WindowPreferences = { side: SidePreference; style: StylePreference };
export type SystemLayout = { side: ButtonSide; buttons: WindowButton[] };
export type ResolvedLayout = { side: ButtonSide; buttons: WindowButton[]; style: StylePreference };

export const WINDOW_PREFERENCES_KEY = 'talentum.janela.botoes';
export const DEFAULT_WINDOW_PREFERENCES: WindowPreferences = { side: 'sistema', style: 'discreto' };

// Ordem de cada lado quando a pessoa fixa o lado: a do macOS à esquerda, a do Windows à direita.
const FIXED_ORDER: Record<ButtonSide, WindowButton[]> = {
  left: ['close', 'minimize', 'maximize'],
  right: ['minimize', 'maximize', 'close'],
};
const FALLBACK: SystemLayout = { side: 'right', buttons: FIXED_ORDER.right };

export function parseWindowPreferences(raw: string | null): WindowPreferences {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<WindowPreferences> | null;
    return {
      side: value?.side === 'esquerda' || value?.side === 'direita' ? value.side : 'sistema',
      style: value?.style === 'colorido' ? 'colorido' : 'discreto',
    };
  } catch {
    return DEFAULT_WINDOW_PREFERENCES;
  }
}

export function resolveLayout(system: SystemLayout | null, preferences: WindowPreferences): ResolvedLayout {
  if (preferences.side === 'esquerda') return { side: 'left', buttons: FIXED_ORDER.left, style: preferences.style };
  if (preferences.side === 'direita') return { side: 'right', buttons: FIXED_ORDER.right, style: preferences.style };
  const layout = system && system.buttons.length > 0 ? system : FALLBACK;
  return { side: layout.side, buttons: layout.buttons, style: preferences.style };
}
