# Talentum: Piloto Automático Financeiro

## 1. Visão Geral

O Talentum é um aplicativo de gestão financeira **Local-First** e **Open Source** para pessoas com rotinas intensas. A proposta é reduzir a fricção da organização financeira por meio da leitura automatizada de extratos, categorização de transações, acompanhamento de metas e orientação de aportes.

O sistema transforma dados financeiros em decisões práticas sem exigir que o usuário registre manualmente cada gasto ou seja especialista em investimentos.

### Proposta de valor

- Importar extratos bancários e faturas em PDF ou OFX.
- Categorizar automaticamente a maior parte das transações.
- Mostrar o dinheiro realmente disponível para gastar.
- Identificar gastos recorrentes, assinaturas, faturas e débitos automáticos.
- Apoiar metas de compra e construção de patrimônio.
- Sugerir onde direcionar novos aportes usando a metodologia ARCA.
- Incentivar hábitos financeiros por meio de missões, XP e conquistas.
- Preservar os dados financeiros no dispositivo do usuário.

### Conceito central

```text
[ LEITOR ] -> [ TRIAGEM ] -> [ SALDO REAL ] -> [ DECISÃO ARCA ]
  Lê        Valida         Desconta           Indica onde
  extrato   dúvidas        contas futuras     aportar
  sem        com um toque   do mês             dentro da margem
  digitação
```

## 2. Princípios do Produto

### Zero fricção

A automação passiva é a prioridade. Formulários manuais existem apenas para exceções, como gastos em dinheiro ou transações que precisam de conciliação.

### Privacidade local-first

Os dados financeiros reais, incluindo extratos, transações, estabelecimentos e valores, permanecem no computador do usuário. A nuvem armazena somente os metadados necessários para autenticação e, quando habilitado, backups criptografados.

### Decisões guiadas

O aplicativo traduz informações financeiras em orientações simples: quanto pode ser gasto, qual conta precisa ser conferida, qual meta está atrasada e qual pilar patrimonial deve receber o próximo aporte.

### Open Source

O projeto deve permitir auditoria do código, favorecer a transparência e oferecer exportação dos dados em formatos abertos.

## 3. Público e Problemas Resolvidos

O público principal são pessoas que:

- têm pouco tempo para controlar as próprias finanças;
- acumulam contas, cartões e instituições diferentes;
- não querem digitar cada transação manualmente;
- precisam identificar desperdícios e assinaturas esquecidas;
- desejam comprar ou realizar objetivos sem perder o controle do orçamento;
- querem começar ou organizar uma carteira de investimentos;
- precisam de privacidade para dados financeiros sensíveis.

O produto combate especialmente a falsa sensação de disponibilidade causada por saldos que ainda serão consumidos por faturas, aluguel, contas recorrentes e débitos automáticos.

## 4. Navegação do Aplicativo

O aplicativo possui seis áreas principais:

1. **Início:** dashboard executivo e saúde financeira.
2. **Extratos, Cartões e Benefícios:** importação, transações, faturas e retorno dos cartões.
3. **Conciliação Financeira:** validação manual e ajustes.
4. **Patrimônio e Metas:** carteira ARCA, aportes e objetivos.
5. **Invest:** notícias econômicas e análises relacionadas à carteira.
6. **Histórico e Perfil:** timeline, gamificação, privacidade e backups.

Além dessas áreas, existem modais ou funções acessíveis globalmente para notificações, importação de arquivos e lançamento express de gastos em dinheiro.

## 5. Aba Início: Dashboard Executivo

### Objetivo

Apresentar a situação financeira do usuário em poucos segundos, com foco no que exige atenção hoje.

### Componentes

#### Saldo Real Drenado

Exibe o saldo bancário disponível descontando automaticamente faturas abertas, contas recorrentes e débitos mapeados com vencimento até o fim do mês. O resultado representa o **Saldo Livre de Risco**, ou seja, o valor que pode ser gasto sem comprometer obrigações futuras.

#### Média de gastos diária

Compara o consumo diário atual com o limite ideal do período e informa o avanço do orçamento mensal.

#### Evolução financeira

Apresenta a evolução da média móvel de gastos, dos aportes e do orçamento consumido.

#### Notificações ativas

Exibe alertas sobre:

- faturas próximas do vencimento;
- débitos automáticos do dia;
- contas recorrentes;
- proventos ou dividendos de ativos cadastrados;
- extratos que ainda não foram importados;
- pilares patrimoniais que exigem atenção;
- novas conquistas e mudanças de nível.

#### Gamificação

Mostra o nível atual, o XP acumulado, o progresso para o próximo nível e a missão ativa.

#### Status da carteira

Indica de forma simples se a carteira está equilibrada, se algum pilar está defasado ou se existe um pilar acima da faixa de tolerância.

## 6. Aba Extratos, Cartões e Benefícios

### Objetivo

Concentrar a operação de importação, leitura e acompanhamento de transações, cartões e faturas.

### Importação

O usuário pode:

- arrastar e soltar arquivos;
- importar extratos em PDF;
- importar arquivos OFX;
- futuramente conectar instituições por Open Finance.

O fluxo de importação possui três etapas:

1. **Seleção do arquivo:** o usuário escolhe ou arrasta o extrato.
2. **Processamento:** o aplicativo extrai as transações e tenta categorizá-las automaticamente.
3. **Triagem:** somente os lançamentos com baixa confiança são encaminhados para confirmação manual.

O usuário deve visualizar o progresso do processamento, incluindo a quantidade de transações lidas e categorizadas.

### Lista inteligente de lançamentos

Deve permitir busca e filtros por:

- período;
- categoria;
- banco ou conta;
- palavra-chave;
- instituição;
- tipo de transação.

As transações podem ser agrupadas visualmente por dia.

### Faturas e débitos automáticos

O usuário cadastra contas recorrentes e débitos automáticos, como:

- fatura de cartão;
- aluguel;
- luz e internet;
- serviços de streaming;
- mensalidades;
- outras cobranças fixas.

Cada registro pode conter valor, data de vencimento, instituição, recorrência e conta utilizada. Esses dados alimentam o Saldo Real Drenado e os alertas de conferência.

### Retorno real do cartão

O módulo compara a anuidade com os benefícios gerados pelo cartão, incluindo cashback, milhas e pontos.

Exemplo de leitura:

```text
Benefícios acumulados: R$ 120,00
Anuidade no período:   R$ 45,00
Resultado líquido:     R$ 75,00 de benefício
Status:                cartão vantajoso
```

### Termômetro de isenção

Mostra quanto já foi gasto no mês e quanto falta para atingir a faixa de gastos necessária para isentar ou reduzir a anuidade.

### Milhas, pontos e cashback

O sistema pode estimar os benefícios gerados pela fatura e avisar sobre pontos próximos da expiração.

## 7. Aba de Conciliação Financeira

### Objetivo

Resolver rapidamente os casos em que a automação não possui confiança suficiente ou em que o lançamento precisa de uma correção manual.

### Funcionalidades

#### Smart Triage

Transações com categoria ou identificação incerta aparecem em cartões interativos. O usuário confirma ou ajusta a sugestão com um toque.

#### Ajustes financeiros

Permite registrar:

- juros por atraso;
- multas;
- descontos por pagamento antecipado;
- correções de valor;
- observações adicionais.

#### Lançamento express de dinheiro

O registro de uma despesa em espécie deve ser rápido e estar acessível de qualquer tela. O formulário contém apenas:

1. valor;
2. categoria;
3. nota rápida.

Exemplo: `R$ 15,00 - Café - Dinheiro`.

#### Conferência de fatura

O usuário marca uma fatura como **Conciliada** depois de verificar se a cobrança corresponde ao débito no extrato bancário.

## 8. Aba de Patrimônio e Metas

### Objetivo

Acompanhar o patrimônio, orientar novos aportes e transformar objetivos de compra em planos viáveis.

### Metodologia ARCA

A metodologia ARCA, associada ao trabalho de Thiago Nigro, divide o patrimônio em quatro pilares com alvo de 25% para cada um:

| Pilar | Sigla | Função | Exemplos |
| --- | --- | --- | --- |
| Ações | A | Crescimento e participação em empresas | Ações da B3 |
| Real Estate | R | Renda e exposição imobiliária | FIIs e ativos imobiliários |
| Caixa | C | Segurança, liquidez e reserva | Tesouro Selic e CDBs de liquidez diária |
| Ativos Internacionais | A | Proteção cambial e diversificação global | ETFs, BDRs e ativos em dólar |

O aplicativo deve dar crédito à metodologia e ao seu autor, mas não precisa repetir a marca ARCA em toda a interface.

### Banda de tolerância

Considerando uma margem relativa de 10% sobre a meta de 25%, cada pilar é considerado equilibrado entre **22,5% e 27,5%**.

- **Entre 22,5% e 27,5%:** equilibrado; não há necessidade de aporte corretivo.
- **Abaixo de 22,5%:** pilar defasado; pode receber prioridade.
- **Acima de 27,5%:** pilar sobrecarregado; novos aportes devem ser evitados nele.

A banda reduz recomendações excessivas causadas por oscilações diárias do mercado.

### Calculadora do próximo aporte

O usuário informa quanto pretende investir. O sistema calcula qual pilar está mais distante da meta e recomenda direcionar o novo dinheiro para ele, priorizando aportes em vez de vendas.

Exemplo:

```text
Carteira total: R$ 40.000,00
Ativos Internacionais: 17,5%
Novo aporte: R$ 1.000,00
Recomendação: direcionar o aporte para Ativos Internacionais
```

Se um pilar estiver zerado, o sistema pode sugerir uma classe ou ativo compatível, sem transformar a sugestão em recomendação financeira personalizada.

### Caixinhas de objetivos

O usuário cria uma meta de compra com valor e prazo. O aplicativo calcula o aporte mensal necessário e informa a viabilidade.

Exemplo: `Depositar R$ 300,00 por mês para viajar em dezembro.`

### Destinação do superávit

Ao identificar sobra no orçamento mensal, o sistema sugere uma divisão entre metas e patrimônio.

Exemplo:

```text
Superávit identificado: R$ 400,00
Sugestão: R$ 200,00 para a meta Viagem
          R$ 200,00 para Ativos Internacionais
```

## 9. Modo de Sobrevivência e Quitação

Quando o usuário estiver no vermelho, tiver faturas acumuladas ou estiver pagando juros elevados, o aplicativo deve mudar o foco da construção patrimonial para a recuperação financeira.

Nesse modo:

- recomendações de novos aportes podem ser temporariamente congeladas;
- o usuário é orientado a priorizar a dívida de maior custo;
- o pilar Caixa e a liquidez ganham prioridade;
- a interface destaca contas vencidas, juros e próximos pagamentos;
- a metodologia de alocação patrimonial volta a ser priorizada após a recuperação.

## 10. Aba Invest: Mercado e Notícias

### Objetivo

Permitir que o usuário acompanhe economia e mercado sem ruído, relacionando notícias aos ativos que possui.

### Feed via proxy

Um serviço intermediário coleta RSS e conteúdos de portais financeiros, evitando bloqueios de CORS no cliente e centralizando a integração com as fontes.

### Filtros

- **Mercado Geral:** notícias macroeconômicas e do mercado.
- **Minha Carteira:** notícias relacionadas aos ativos cadastrados.
- **Macro:** notícias de economia e indicadores amplos.

### Cards de notícia

Cada item pode apresentar título, ativo relacionado, fonte, horário, tempo estimado de leitura e link para o conteúdo original.

### Resumos por IA

O usuário pode solicitar um resumo em tópicos objetivos. A versão oficial usa Cloudflare Workers AI na borda, sem exigir que o usuário instale modelos pesados.

O aplicativo deve sempre exibir o crédito da fonte e oferecer o botão para ler a matéria original no site do veículo.

## 11. Aba Histórico, Perfil e Gamificação

### Timeline

Registra cronologicamente:

- importações de extratos;
- edições de lançamentos;
- conciliações;
- aportes;
- metas atingidas;
- backups;
- conquistas;
- mudanças relevantes na carteira.

### Pontos de restauração

Importações e alterações importantes devem permitir desfazer a operação pela timeline, quando tecnicamente possível.

### XP e níveis

O XP recompensa comportamentos financeiros úteis, como importar extratos, manter gastos sob controle, concluir conciliações e registrar aportes alinhados ao planejamento.

| Nível | Título | XP |
| --- | --- | ---: |
| 1 | Poupador Iniciante | 0 a 500 |
| 2 | Construtor de Caixa | 501 a 1.500 |
| 3 | Estrategista ARCA | 1.501 a 3.500 |
| 4 | Mestre do Rebalanceamento | 3.501 a 7.000 |
| 5 | Investidor Inabalável | 7.001 ou mais |

### Badges

- **Escudo de Emergência:** reserva de Caixa equivalente a seis meses de custo de vida.
- **Equilíbrio Perfeito:** quatro pilares dentro da banda de tolerância.
- **Leitor de Mercado:** pelo menos dez resumos de notícias visualizados.
- **Meta Batida:** objetivo concluído sem saque antecipado.

### Missões

#### Diárias e semanais

- importar o extrato dos últimos sete dias;
- revisar lançamentos pendentes;
- ler dois resumos sobre ativos da carteira.

#### Mensais

- realizar um aporte no pilar mais defasado;
- revisar categorias automatizadas;
- conferir faturas e débitos recorrentes.

### Privacidade e backup

O perfil deve permitir consultar o estado do banco SQLite local, exportar dados em JSON ou CSV e disparar um backup criptografado.

## 12. Onboarding e Primeiro Acesso

A primeira experiência deve durar no máximo 45 segundos e usar pouco texto.

### Landing page

1. O usuário escolhe Windows ou Linux para baixar o aplicativo.
2. Faz login ou cadastro usando Google OAuth 2.0.
3. A conta é registrada no Cloudflare D1.
4. O download do executável é liberado.

### Primeiro uso no Electron

1. O aplicativo solicita login com a mesma conta Google.
2. A sessão é validada.
3. O banco SQLite local é criado.
4. O usuário define ou importa seus dados financeiros iniciais.

### Tutorial de três cards

1. **Leitor automatizado:** importar um extrato em PDF ou OFX.
2. **Metas:** criar uma reserva, viagem ou outra compra planejada.
3. **Patrimônio:** visualizar a carteira nos quatro pilares.

### Dados patrimoniais iniciais

O usuário pode informar rapidamente:

- quanto possui em Tesouro, CDB ou outras reservas;
- se possui ações ou FIIs;
- se possui ativos internacionais;
- ou começar do zero, com patrimônio inicial igual a R$ 0,00.

## 13. Alertas e Notificações

A central de notificações deve avisar sobre eventos acionáveis e evitar excesso de mensagens.

### Exemplos

- `Sua fatura de R$ 1.200,00 vence hoje. Confira se o débito ocorreu corretamente.`
- `Hoje é o dia previsto para o pagamento de proventos de XPML11.`
- `O extrato desta semana ainda não foi importado.`
- `Sobraram R$ 400,00 no orçamento. Deseja direcionar esse valor?`
- `O pilar de Ativos Internacionais está abaixo da faixa de equilíbrio.`

## 14. Arquitetura Técnica Oficial

### Aplicativo desktop

| Camada | Tecnologia | Função |
| --- | --- | --- |
| Shell desktop | Electron | Executável para Windows e Linux e gerenciamento da janela |
| Frontend e full-stack | Next.js com App Router | Interface React, Tailwind CSS e servidor local |
| ORM e banco | Prisma ORM e SQLite | Persistência local tipada no arquivo `local.db` |
| API local | Route Handlers do Next.js | Endpoints locais para transações, extratos e ARCA |
| Parsing | PDF.js e Node-OFX | Leitura de PDFs e arquivos OFX |

### Nuvem e autenticação

| Serviço | Tecnologia | Função |
| --- | --- | --- |
| Edge e integração | Cloudflare Workers | APIs serverless, proxy e serviços de borda |
| Metadados | Cloudflare D1 | Conta, autenticação e referências de backup |
| Identidade | Google OAuth 2.0 | Login na landing page e no aplicativo |
| Resumos | Cloudflare Workers AI | Geração de resumos de notícias na nuvem |

### Privacidade e backup

- O SQLite local guarda os dados financeiros completos.
- O backup é um snapshot criptografado antes do envio.
- A criptografia prevista é AES-256-GCM.
- O modelo é de conhecimento zero para os dados financeiros: a nuvem não deve conseguir ler os valores enviados.
- Os dados devem poder ser exportados em formatos abertos.

### Ollama

Ollama foi considerado como alternativa local gratuita para executar modelos como Llama, Phi ou Mistral. Porém, a instalação de modelos grandes aumenta o consumo de disco, RAM e GPU e cria uma etapa adicional para o usuário.

A decisão final é usar Cloudflare Workers AI como caminho principal, deixando o Ollama apenas como possibilidade futura ou fallback opcional.

## 15. Fluxo de Comunicação

```text
[ LANDING PAGE ] -- Google OAuth --> [ CLOUDFLARE D1 ]
        |                                  |
        +-- libera download               +-- metadados e backup criptografado
                                           |
                                           v
[ APP ELECTRON ]
  +-- Next.js local
  +-- API local (/api)
  +-- Prisma ORM
  +-- SQLite local
  +-- processamento PDF/OFX
  +-- Cloudflare Workers AI para resumos
  +-- backup E2EE para a nuvem
```

## 16. Modelo Inicial de Dados

O modelo conceitual mínimo inclui:

- **UsuarioMetadados:** identidade, e-mail, XP, nível e data de criação.
- **Transacao:** data, descrição, estabelecimento, valor, tipo, categoria, banco e status de validação.
- **AtivoArca:** pilar, ativo, valor atual, percentual e data de atualização.
- **HistoricoTimeline:** título, descrição, categoria, XP ganho e data.

Exemplo de entidades em Prisma:

```prisma
model UsuarioMetadados {
  id         String   @id @default(uuid())
  googleId   String   @unique
  email      String
  xpTotal    Int      @default(0)
  nivelAtual Int      @default(1)
  criadoEm   DateTime @default(now())
}

model Transacao {
  id              String   @id @default(uuid())
  data            DateTime
  descricao       String
  estabelecimento String?
  valor           Float
  tipo            String
  categoria       String
  validado        Boolean  @default(true)
  banco           String?
  criadoEm        DateTime @default(now())
}

model AtivoArca {
  id            String   @id @default(uuid())
  pilar         String
  nomeAtivo     String
  valorAtual    Float
  percentual    Float
  atualizadoEm  DateTime @updatedAt
}

model HistoricoTimeline {
  id          String   @id @default(uuid())
  titulo      String
  descricao   String
  categoria   String
  xpGanha     Int      @default(0)
  criadoEm    DateTime @default(now())
}
```

## 17. API Local e Rebalanceamento

A camada de API do Next.js oculta o acesso ao Prisma e concentra as regras de negócio. Exemplos de rotas previstas:

- `/api/extratos` para importação e processamento;
- `/api/transacoes` para consulta e ajustes;
- `/api/arca` para carteira e metas;
- `/api/arca/rebalancear` para sugestão de aporte;
- `/api/resumo` para consumir o Worker de IA.

O endpoint de rebalanceamento deve:

1. buscar os ativos locais;
2. calcular o patrimônio total;
3. calcular o percentual de cada pilar;
4. identificar o pilar mais distante da meta;
5. considerar a banda de 22,5% a 27,5%;
6. retornar uma sugestão para o valor informado pelo usuário.

## 18. Resultado Esperado

O Talentum deve funcionar como um piloto automático financeiro: ler os dados com o mínimo de esforço, pedir confirmação somente quando necessário, antecipar obrigações, mostrar o saldo realmente disponível e orientar o próximo passo financeiro com clareza.

O produto combina automação, privacidade local, planejamento de metas, acompanhamento patrimonial e educação financeira prática em uma experiência simples e acionável.

## 19. Padrão de Desenvolvimento Local

O projeto usará `pnpm` como gerenciador de pacotes e terá a porta `3000` reservada para o servidor local do Next.js.

### Scripts previstos

```text
pnpm run dev
```

O comando deve:

1. encerrar qualquer processo que esteja usando a porta `3000`;
2. remover o cache `.next`;
3. iniciar uma nova instância do Next.js na porta `3000`.

```text
pnpm run dev:all
```

O comando deve iniciar o Next.js na porta `3000` e abrir `http://localhost:3000` dentro do Electron.

Os scripts devem funcionar de forma previsível no Windows e impedir que uma instância anterior do servidor ou um cache desatualizado interfira no desenvolvimento.