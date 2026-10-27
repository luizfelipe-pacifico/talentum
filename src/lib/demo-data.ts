export { PAGE_META, TAB_GROUPS } from './navigation';

/* Configuração estática de navegação e apresentação.
   Dados financeiros nunca devem ser definidos neste arquivo. */

export type NavEntry = {
  href: string;
  icon: string;
  label: string;
  badge?: string;
};

/* A rota raiz é o Início e não aparece aqui de propósito: chega-se a ela pela
   marca no topo da sidebar, não por um item de navegação. */
export const NAV: NavEntry[] = [
  { href: '/dashboard', icon: 'bi-speedometer2', label: 'Dashboard' },
  { href: '/extratos', icon: 'bi-receipt', label: 'Extratos' },
  { href: '/conciliacao', icon: 'bi-check2-square', label: 'Conciliação' },
  { href: '/patrimonio', icon: 'bi-columns-gap', label: 'Patrimônio' },
  { href: '/invest', icon: 'bi-newspaper', label: 'Invest' },
  { href: '/historico', icon: 'bi-clock-history', label: 'Histórico' },
];

/** Cartões de acesso às áreas, exibidos no Início. */
export const HOME_AREAS: { href: string; icon: string; label: string; text: string }[] = [
  { href: '/dashboard', icon: 'bi-speedometer2', label: 'Dashboard', text: 'Saldo, gastos do mês e o que já está comprometido.' },
  { href: '/extratos', icon: 'bi-receipt', label: 'Extratos', text: 'Lançamentos importados, cartões e recorrências.' },
  { href: '/conciliacao', icon: 'bi-check2-square', label: 'Conciliação', text: 'Confirme ou corrija o que ficou em dúvida.' },
  { href: '/patrimonio', icon: 'bi-columns-gap', label: 'Patrimônio', text: 'Ativos, metas e destinação de aportes.' },
  { href: '/invest', icon: 'bi-newspaper', label: 'Invest', text: 'Economia e mercado ligados aos seus ativos.' },
  { href: '/historico', icon: 'bi-clock-history', label: 'Histórico', text: 'Trilha de eventos, dados locais e backup.' },
];

export const IMPORT_LABELS = ['Seleção do arquivo', 'Processamento', 'Triagem'];

export const THEME_OPTIONS = [
  { value: 'Claro', icon: 'bi-sun' },
  { value: 'Escuro', icon: 'bi-moon-stars' },
  { value: 'Sistema', icon: 'bi-circle-half' },
] as const;
