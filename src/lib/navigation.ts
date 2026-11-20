/* Navegação do aplicativo: títulos por rota, abas e qual item está ativo.

   Sem imports de propósito: as regras rodam no shell e direto nos testes. */

/** Título e contexto do cabeçalho, por prefixo de rota. Mais específico primeiro. */
export const PAGE_META: { prefix: string; title: string; context: string }[] = [
  { prefix: '/dashboard', title: 'Dashboard', context: 'Sua posição financeira atual' },
  { prefix: '/extratos', title: 'Extratos e cartões', context: 'Importação, lançamentos, faturas e benefícios' },
  { prefix: '/conciliacao', title: 'Conciliação financeira', context: 'Confirme ou corrija o que ficou em dúvida' },
  { prefix: '/patrimonio/aportes', title: 'Próximo aporte', context: 'Simulação de aporte novo entre os quatro pilares' },
  { prefix: '/patrimonio/metas', title: 'Metas', context: 'Valor, prazo, contribuições e viabilidade' },
  { prefix: '/patrimonio', title: 'Patrimônio e metas', context: 'Bens, quatro pilares, aportes e metas' },
  { prefix: '/planejamento/orcamento', title: 'Orçamento', context: 'Limite por categoria, gasto confirmado e sobra do mês' },
  { prefix: '/planejamento/dividas', title: 'Dívidas', context: 'Ordem de pagamento e plano de quitação' },
  { prefix: '/planejamento/sobrevivencia', title: 'Modo sobrevivência', context: 'Liquidez e gastos essenciais' },
  { prefix: '/planejamento/rendas', title: 'Rendas previstas', context: 'Entradas esperadas, fora do Saldo Livre de Risco' },
  { prefix: '/planejamento', title: 'Planejamento', context: 'Orçamento, dívidas e rendas' },
  { prefix: '/invest', title: 'Invest', context: 'Notícias de economia de fontes públicas' },
  { prefix: '/historico', title: 'Histórico e perfil', context: 'Trilha de eventos, dados locais e progresso' },
  { prefix: '/perfil/privacidade', title: 'Dados e backup', context: 'Banco local, exportação e backup cifrado' },
  { prefix: '/perfil', title: 'Perfil e progresso', context: 'Missões, XP, níveis e conquistas' },
  { prefix: '/contas/nova', title: 'Nova conta', context: 'Onde você mantém dinheiro' },
  { prefix: '/contas', title: 'Contas e saldos', context: 'Instituições, contas, saldos e chaves PIX próprias' },
  { prefix: '/configuracoes/seguranca', title: 'Segurança', context: 'Senha, código de recuperação, autenticador e bloqueio automático' },
  { prefix: '/configuracoes', title: 'Configurações', context: 'Preferências do aplicativo' },
  { prefix: '/notificacoes', title: 'Notificações', context: 'Avisos gerados a partir dos seus dados' },
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
    prefix: '/planejamento',
    tabs: [
      { href: '/planejamento/orcamento', label: 'Orçamento' },
      { href: '/planejamento/dividas', label: 'Dívidas' },
      { href: '/planejamento/sobrevivencia', label: 'Modo sobrevivência' },
      { href: '/planejamento/rendas', label: 'Rendas previstas' },
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
  {
    prefix: '/configuracoes',
    tabs: [
      { href: '/configuracoes', label: 'Preferências' },
      { href: '/configuracoes/categorias', label: 'Categorias' },
      { href: '/configuracoes/seguranca', label: 'Segurança' },
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
