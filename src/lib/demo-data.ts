/* Configuração estática de navegação e apresentação.
   Dados financeiros nunca devem ser definidos neste arquivo. */

export type NavEntry = {
  href: string;
  icon: string;
  label: string;
  badge?: string;
};

export const NAV: NavEntry[] = [
  { href: '/', icon: 'bi-speedometer2', label: 'Dashboard' },
  { href: '/extratos', icon: 'bi-receipt', label: 'Extratos' },
  { href: '/conciliacao', icon: 'bi-check2-square', label: 'Conciliação' },
  { href: '/patrimonio', icon: 'bi-columns-gap', label: 'Patrimônio' },
  { href: '/invest', icon: 'bi-newspaper', label: 'Invest' },
  { href: '/historico', icon: 'bi-clock-history', label: 'Histórico' },
];

/** Título e contexto do cabeçalho, por prefixo de rota. Mais específico primeiro. */
export const PAGE_META: { prefix: string; title: string; context: string }[] = [
  { prefix: '/extratos', title: 'Extratos e cartões', context: 'Importação, lançamentos, faturas e benefícios' },
  { prefix: '/conciliacao', title: 'Conciliação financeira', context: 'Nenhum item aguardando decisão' },
  { prefix: '/patrimonio', title: 'Patrimônio e metas', context: 'Cadastre seu patrimônio para iniciar' },
  { prefix: '/invest', title: 'Invest', context: 'Economia e mercado, relacionados aos seus ativos' },
  { prefix: '/historico', title: 'Histórico e perfil', context: 'Trilha de eventos, dados locais e progresso' },
  { prefix: '/perfil/privacidade', title: 'Dados e backup', context: 'Banco local, exportação e backup cifrado' },
  { prefix: '/perfil', title: 'Perfil e progresso', context: 'Missões, XP, níveis e conquistas' },
  { prefix: '/configuracoes', title: 'Configurações', context: 'Preferências do aplicativo' },
  { prefix: '/onboarding', title: 'Primeiro acesso', context: 'Fotografia financeira inicial e privacidade local' },
  { prefix: '/', title: 'Dashboard', context: 'Sua posição financeira atual' },
];

export const TAB_GROUPS: { prefix: string; tabs: { href: string; label: string }[] }[] = [
  {
    prefix: '/extratos',
    tabs: [
      { href: '/extratos', label: 'Lançamentos' },
      { href: '/extratos/cartoes', label: 'Cartões e benefícios' },
      { href: '/extratos/recorrencias', label: 'Faturas e recorrências' },
    ],
  },
  {
    prefix: '/conciliacao',
    tabs: [
      { href: '/conciliacao', label: 'Fila de pendências' },
      { href: '/conciliacao/faturas', label: 'Conferência de fatura' },
    ],
  },
  {
    prefix: '/patrimonio',
    tabs: [
      { href: '/patrimonio', label: 'Quatro pilares' },
      { href: '/patrimonio/aportes', label: 'Próximo aporte' },
      { href: '/patrimonio/metas', label: 'Metas' },
    ],
  },
  { prefix: '/historico', tabs: [{ href: '/historico', label: 'Timeline' }, { href: '/perfil', label: 'Perfil e progresso' }, { href: '/perfil/privacidade', label: 'Dados e backup' }] },
  { prefix: '/perfil', tabs: [{ href: '/historico', label: 'Timeline' }, { href: '/perfil', label: 'Perfil e progresso' }, { href: '/perfil/privacidade', label: 'Dados e backup' }] },
];

export const CONTAS: { label: string; saldo: string }[] = [
  { label: 'Sem contas', saldo: '' },
];

export const IMPORT_LABELS = ['Seleção do arquivo', 'Processamento', 'Triagem'];

export const THEME_OPTIONS = [
  { value: 'Claro', icon: 'bi-sun' },
  { value: 'Escuro', icon: 'bi-moon-stars' },
  { value: 'Sistema', icon: 'bi-circle-half' },
] as const;
