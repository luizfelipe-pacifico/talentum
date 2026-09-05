/* Dados sintéticos de demonstração.
   Nenhum valor real: o app está em pré-alpha e ainda não lê extratos de verdade.
   Fixtures reais devem continuar sintéticas, conforme docs/DEVELOPMENT.md. */

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

export type FilaItem = {
  desc: string;
  meta: string;
  valor: string;
  conf: number;
  sugestao: string;
  razao: string;
};

export const FILA: FilaItem[] = [
  {
    desc: 'CLARO*NET SP',
    meta: '03/09 · débito automático · Conta corrente Aurora',
    valor: 'R$ 129,90',
    conf: 58,
    sugestao: 'Moradia · Internet',
    razao:
      'O nome do estabelecimento aparece em três cobranças mensais de valor parecido, mas nunca foi confirmado por você.',
  },
  {
    desc: 'PG *MERCADOLIVRE',
    meta: '02/09 · crédito · Aurora Platinum',
    valor: 'R$ 248,70',
    conf: 41,
    sugestao: 'Compras · Casa',
    razao: 'Marketplace com histórico misto: já foi classificado como Casa, Eletrônicos e Presentes.',
  },
  {
    desc: 'TRANSF PIX J. MENDES',
    meta: '01/09 · transferência enviada · Vega',
    valor: 'R$ 600,00',
    conf: 34,
    sugestao: 'Transferência entre pessoas',
    razao: 'Sem histórico para este destinatário. Pode ser despesa, empréstimo ou aporte.',
  },
  {
    desc: 'DROGARIA AURELIA 04',
    meta: '01/09 · crédito · Aurora Platinum',
    valor: 'R$ 87,60',
    conf: 71,
    sugestao: 'Saúde · Farmácia',
    razao: 'Padrão compatível com compras anteriores na mesma rede, em outra unidade.',
  },
];

export const CATEGORIAS_OPCOES = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Assinaturas',
  'Compras',
  'Transferência',
];

export type Mes = {
  mes: string;
  mesLongo: string;
  gasto: number;
  aporte: number;
  gastoFmt: string;
  aporteFmt: string;
};

export const EVOLUCAO: Mes[] = [
  { mes: 'fev', mesLongo: 'Fevereiro', gasto: 62, aporte: 18, gastoFmt: 'R$ 2.480,00', aporteFmt: 'R$ 350,00' },
  { mes: 'mar', mesLongo: 'Março', gasto: 71, aporte: 22, gastoFmt: 'R$ 2.840,00', aporteFmt: 'R$ 420,00' },
  { mes: 'abr', mesLongo: 'Abril', gasto: 58, aporte: 30, gastoFmt: 'R$ 2.320,00', aporteFmt: 'R$ 580,00' },
  { mes: 'mai', mesLongo: 'Maio', gasto: 66, aporte: 26, gastoFmt: 'R$ 2.640,00', aporteFmt: 'R$ 500,00' },
  { mes: 'jun', mesLongo: 'Junho', gasto: 80, aporte: 14, gastoFmt: 'R$ 3.200,00', aporteFmt: 'R$ 280,00' },
  { mes: 'jul', mesLongo: 'Julho', gasto: 74, aporte: 34, gastoFmt: 'R$ 2.960,00', aporteFmt: 'R$ 650,00' },
  { mes: 'ago', mesLongo: 'Agosto', gasto: 69, aporte: 42, gastoFmt: 'R$ 2.760,00', aporteFmt: 'R$ 800,00' },
  { mes: 'set', mesLongo: 'Setembro', gasto: 39, aporte: 26, gastoFmt: 'R$ 1.560,00', aporteFmt: 'R$ 500,00' },
];

export type Categoria = { nome: string; valor: string; pct: string; bar: number };

export const CATEGORIAS: Categoria[] = [
  { nome: 'Moradia', valor: 'R$ 802,88', pct: '34', bar: 100 },
  { nome: 'Alimentação', valor: 'R$ 519,51', pct: '22', bar: 65 },
  { nome: 'Transporte', valor: 'R$ 306,98', pct: '13', bar: 38 },
  { nome: 'Assinaturas', valor: 'R$ 212,53', pct: '9', bar: 26 },
  { nome: 'Saúde', valor: 'R$ 188,91', pct: '8', bar: 24 },
  { nome: 'Outros', valor: 'R$ 330,59', pct: '14', bar: 41 },
];

export const CONTAS: { label: string; saldo: string }[] = [
  { label: 'Todas as contas', saldo: 'R$ 0,00' },
];

export const DEMO_STATES = [
  { key: 'cheio', label: 'Com dados' },
  { key: 'vazio', label: 'Vazio' },
  { key: 'carregando', label: 'Carregando' },
  { key: 'erro', label: 'Erro' },
  { key: 'semResultados', label: 'Sem resultados' },
] as const;

export const IMPORT_LABELS = ['Seleção do arquivo', 'Processamento', 'Triagem'];

export const APORTE_ATALHOS = ['R$ 200,00', 'R$ 500,00', 'R$ 1.000,00', 'R$ 2.000,00'];

export const FILTROS_INVEST = ['Mercado Geral', 'Minha Carteira', 'Macro'];

export const THEME_OPTIONS = [
  { value: 'Claro', icon: 'bi-sun' },
  { value: 'Escuro', icon: 'bi-moon-stars' },
  { value: 'Sistema', icon: 'bi-circle-half' },
] as const;
