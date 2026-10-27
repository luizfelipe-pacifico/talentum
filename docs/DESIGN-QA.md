# Validação de design e experiência

Este documento registra as revisões visuais executadas no protótipo. Ele não substitui testes de acessibilidade, usabilidade com pessoas usuárias ou validação do Electron empacotado.

## Auditoria de 5 de setembro de 2026

### Escopo

Foram percorridas no Chrome, do início ao fim, as rotas:

- `/`, `/extratos`, `/extratos/cartoes`, `/extratos/cartoes/aurora`;
- `/extratos/importar`, `/extratos/importar/lote-demo`, `/extratos/recorrencias`;
- `/conciliacao`, `/conciliacao/faturas`;
- `/patrimonio`, `/patrimonio/aportes`, `/patrimonio/metas`, `/patrimonio/metas/viagem`;
- `/invest`, `/invest/fundos-logistica`;
- `/historico`, `/perfil`, `/perfil/privacidade`, `/configuracoes` e `/onboarding`.

### Ajustes realizados

- Montserrat passou a ser a fonte de interface e Playfair Display a fonte de destaque, sem depender de carregamento externo.
- A marca lateral voltou a exibir símbolo e nome, sempre com `icon-talentum-dark.svg` sobre a sidebar escura.
- Perfil e controles da janela foram organizados no mesmo cabeçalho.
- Cards receberam uma escala consistente de respiro interno: 16 px nos compactos, 18 px nos padrão e 20 px nos destacados.
- Margens nativas de títulos e parágrafos foram normalizadas para evitar espaçamentos acidentais; a separação agora pertence aos componentes.
- Cabeçalhos internos deixaram de duplicar padding e borda dentro de cards já acolchoados.
- Grades de indicadores, patrimônio e configurações foram reorganizadas para manter hierarquia e leitura em larguras menores.
- Missões e conquistas do perfil foram alinhadas como listas verticais.
- A rota de detalhe do cartão passou a exibir resumo e movimentações próprios.
- O título contextual de `/onboarding` foi corrigido para "Primeiro acesso".
- A rota raiz foi nomeada "Dashboard" e passou a iniciar com valores zerados e chamadas claras para onboarding ou importação.
- O seletor de tema recebeu largura, seta e área de clique próprias para evitar sobreposição do controle nativo.

### Resultado observado

- Nenhuma das 20 rotas apresentou rolagem horizontal no documento ou na área principal.
- Os fluxos revisados não emitiram erros ou avisos no console do navegador.
- O comportamento responsivo foi inspecionado em larguras de 1.536 px, 1.180 px e 1.024 px.
- Os temas claro e escuro preservaram contraste visual e hierarquia na inspeção realizada.

As capturas de trabalho ficam somente em `temp/ui-audit/`, diretório ignorado pelo Git, e não fazem parte do código-fonte.

## Lapidação da landing page em 25 de outubro de 2026

### Método

Refinamento da LP em `apps/web`, guiado pelas skills Impeccable (`polish`, `adapt`), taste-skill e Emil Kowalski (`emil-design-eng`), descritas em `DEVELOPMENT.md`. Foi refinamento, não redesenho: identidade, textos e comportamento foram preservados, e o `BRANDING.md` prevaleceu sobre as skills em paleta, tipografia e segunda linha do título em âmbar.

A responsividade foi medida com o inspetor da taste-skill (`scripts/inspect.mjs`), que abre a build de produção no Chrome real por CDP em cinco larguras: 390 px (celular), 768 px (tablet), 1280 px (desktop pequeno), 1440 px (desktop padrão) e 1920 px (desktop grande). As capturas ficam em `.taste-skill/`, diretório ignorado pelo Git. A extensão do Chrome não estava habilitada na sessão; o inspetor usou o Chrome instalado em modo headless.

### Defeitos corrigidos

- Cabeçalho: no celular e no tablet a navegação ocupava duas linhas fixas, cerca de 170 px. Abaixo de 1000 px ela vira o menu recolhível "Seções", e o link do repositório vira ícone abaixo de 560 px.
- Herói: a gravura renderizava com um terço do tamanho por falta de largura no wrapper do parallax. O título passou a ocupar a largura inteira e cabe em duas linhas de 768 px a 1920 px.
- Herói: o título e o texto nasciam invisíveis dentro do revelador, atrasando o LCP. O herói agora renderiza estático.
- Grades: quatro itens viravam três mais um no desktop e três viravam dois mais um no tablet. As colunas passaram a ser explícitas por faixa de largura.
- Cinco passos: cinco colunas estreitas espremiam texto de 13 px. Abaixo de 1100 px viram linhas com o ícone à esquerda.
- Leitura: texto corrido de 13 a 14 px subiu para 15 a 16 px; nenhum texto de leitura fica abaixo de 13 px.
- Celular: o parallax empurrava a ampulheta para cima da citação da mesma seção, e a tabela do Saldo Livre de Risco quebrava valores monetários. O parallax é desligado com colunas empilhadas e valores não quebram.
- Navegação: "O problema" aparecia ativo ainda no herói.
- Afordância: cartões e gravuras sem destino subiam no hover. O hover foi removido deles; botões ganharam resposta ao toque.
- Revelação: blocos recolhiam ao sair da tela e repetiam a entrada a cada rolagem, e ficavam invisíveis sem JavaScript. Agora revelam uma vez e aparecem sempre que não há script.
- Toque: setas, abas e pontos do carrossel ganharam área mínima de 24 px (pontos) a 44 px (botões).
- Ornamentos proibidos pelas skills e pelo `BRANDING.md`: rótulos acima dos títulos, numeração 01 a 05, rótulos em caixa alta espaçada, brilho radial que seguia o ponteiro, textura de grão sobre a página, animação contínua do "Role para ler" e sombras em repouso. Contornos de 1 px foram trocados por degraus de tom.

### Desempenho e busca

Lighthouse 13.5.0, mesmo motor do PageSpeed Insights, com a emulação padrão de celular e o preset de desktop. A API pública do PageSpeed Insights estava com a cota diária esgotada (HTTP 429) no momento do teste.

| Medição | Desempenho | Acessibilidade | Boas práticas | SEO | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| Publicada, celular | 89 | 97 | 100 | 92 | 3,2 s | 0,001 |
| Publicada, desktop | 100 | 97 | 100 | 92 | 0,7 s | 0,028 |
| Lapidada, celular | 94 | 100 | 100 | 100 | 2,9 s | 0 |
| Lapidada, desktop | 100 | 100 | 100 | 100 | 0,7 s | 0 |

A versão lapidada foi medida em `next start` local, sem a CDN da Vercel; a publicada foi medida no domínio público.

O que mudou o resultado: metadados sempre no `<head>` (`htmlLimitedBots`), CSS embutido no HTML (`experimental.inlineCss`), ícones do Bootstrap Icons em SVG inline em vez da fonte de 131 KB, fontes de fallback com métricas ajustadas (CLS zero), variantes de 640 px das capturas no `srcset` e sublinhado no link dentro de frase.

### Correção posterior: conteúdo invisível em desenvolvimento

No `next dev`, a CSP bloqueava o `eval` que o React usa em desenvolvimento, a página não hidratava e os 78 blocos com animação de entrada ficavam invisíveis. A política passou a liberar `'unsafe-eval'` e `ws:` somente em desenvolvimento, e a animação foi invertida: o HTML nasce visível e só blocos fora da tela são escondidos depois da hidratação. Verificado no Chrome por CDP: zero blocos escondidos e nenhum erro de console após rolar a página; com o HTML do servidor, nenhum bloco sai escondido.

Na mesma investigação, `http://localhost:3001` abria outro projeto local que ocupava a porta no IPv6. Ver "Portas compartilhadas com outros projetos" em `DEVELOPMENT.md`.

### Pendências aceitas

- O título do herói ocupa quatro linhas a 390 px. É o lema da marca e não foi encurtado.
- Não há fotografia nem vídeo: o `BRANDING.md` rejeita imagem de banco, e as gravuras foram desenhadas para o projeto.
- A legenda da captura do Início diz que os indicadores mostram zero. A imagem é anterior ao painel atual, que mostra estado vazio. Trocar a captura e a legenda depende de decisão do mantenedor.
- Restam 43 KB de JavaScript não usado e 12 KB de JavaScript legado, vindos do framework.
