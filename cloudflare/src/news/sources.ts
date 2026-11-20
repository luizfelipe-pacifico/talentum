/* Fontes de notícias permitidas (Stage 15).

   Entra aqui só fonte cujos termos permitem reproduzir com crédito, conferidos
   na página da própria fonte. O Worker guarda título, link, fonte, data e um
   trecho curto (até 300 caracteres) e sempre leva ao texto original.

   - Agência Brasil (EBC): "A reprodução é permitida, desde que a Agência
     Brasil seja citada nos créditos do conteúdo" (agenciabrasil.ebc.com.br/sobre,
     consultado em 20 de novembro de 2026). Conteúdo de agências parceiras
     segue regras próprias; por isso só título, trecho e link, nunca o texto.

   Outras fontes (IBGE, Banco Central) ficam Open até seus termos serem
   conferidos. Adicionar uma fonte exige o host em `hosts`, a licença aqui e
   no docs/ARCHITECTURE.md §2.8, e o host na lista de links externos do
   Electron (`EXTERNAL_HOSTS` em electron/main.cjs). */

export type NewsSource = {
  key: string;
  name: string;
  homepage: string;
  feedUrl: string;
  hosts: readonly string[];
  license: string;
};

export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    key: 'agencia-brasil-economia',
    name: 'Agência Brasil',
    homepage: 'https://agenciabrasil.ebc.com.br/economia',
    feedUrl: 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml',
    hosts: ['agenciabrasil.ebc.com.br'],
    license: 'Reprodução permitida com crédito à Agência Brasil.',
  },
];

export const sourceByKey = (key: string) => NEWS_SOURCES.find((source) => source.key === key) ?? null;
