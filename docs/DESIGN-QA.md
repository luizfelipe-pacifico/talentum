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
