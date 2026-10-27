/* Navegação do aplicativo: títulos por rota, abas e qual item está ativo.

   Sem imports de propósito: as regras rodam no shell e direto nos testes. */

/** Título e contexto do cabeçalho, por prefixo de rota. Mais específico primeiro. */
export const PAGE_META: { prefix: string; title: string; context: string }[] = [
  { prefix: '/dashboard', title: 'Dashboard', context: 'Sua posição financeira atual' },
  { prefix: '/extratos', title: 'Extratos e cartões', context: 'Importação, lançamentos, faturas e benefícios' },
  { prefix: '/conciliacao', title: 'Conciliação financeira', context: 'Confirme ou corrija o que ficou em dúvida' },
  { prefix: '/patrimonio', title: 'Patrimônio e metas', context: 'Cadastre seu patrimônio para iniciar' },
  { prefix: '/invest', title: 'Invest', context: 'Economia e mercado, relacionados aos seus ativos' },
  { prefix: '/historico', title: 'Histórico e perfil', context: 'Trilha de eventos, dados locais e progresso' },
  { prefix: '/perfil/privacidade', title: 'Dados e backup', context: 'Banco local, exportação e backup cifrado' },
  { prefix: '/perfil', title: 'Perfil e progresso', context: 'Missões, XP, níveis e conquistas' },
  { prefix: '/configuracoes', title: 'Configurações', context: 'Preferências do aplicativo' },
  { prefix: '/onboarding', title: 'Primeiro acesso', context: 'Fotografia financeira inicial e privacidade local' },
  { prefix: '/layout-guide', title: 'Guia de layout', context: 'Tokens, componentes e regras do sistema visual' },
  { prefix: '/', title: 'Início', context: 'Ponto de partida do Talentum' },
];

/** Cabeçalho de rota que não existe. Antes, toda rota desconhecida herdava Início. */
export const NOT_FOUND_META = { prefix: '', title: 'Página não encontrada', context: 'O endereço não corresponde a nenhuma área' };

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

/** A rota está em `href` ou abaixo dele. A raiz só casa consigo mesma. */
export function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function pageMeta(pathname: string) {
  return PAGE_META.find((entry) => isActive(pathname, entry.prefix)) ?? NOT_FOUND_META;
}

export function tabsFor(pathname: string) {
  return TAB_GROUPS.find((group) => isActive(pathname, group.prefix))?.tabs ?? null;
}

/** Aba ativa: a de prefixo mais longo, para que páginas de detalhe marquem a aba do pai. */
export function activeTab(pathname: string): string | null {
  const tabs = tabsFor(pathname);
  if (!tabs) return null;
  const matches = tabs.filter((tab) => isActive(pathname, tab.href));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
