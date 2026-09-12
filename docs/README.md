# Documentação do Talentum

Este diretório separa as fontes de verdade técnicas dos materiais de produto e do histórico de concepção. Uma decisão descrita como **planejada** não representa funcionalidade implementada.

## Comece por aqui

| Documento | Responsabilidade |
| --- | --- |
| [`ROADMAP.md`](./ROADMAP.md) | MVP, ordem das macrofeatures, dependências e critérios de conclusão |
| [`ROUTING_MVP.md`](./ROUTING_MVP.md) | Plano executável de conclusão do MVP: trilhas cloud e local, rotas, APIs, migrations e Definition of Done |
| [`ONBOARDING.md`](./ONBOARDING.md) | Perguntas, privacidade, fotografia inicial, importação e conciliação de primeiro acesso |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Componentes, limites de confiança, responsabilidades e decisões estruturais |
| [`ARCHITECTURE-WEB.md`](./ARCHITECTURE-WEB.md) | LP, autenticação, downloads e feedback público |
| [`ARCHITECTURE-ELECTRON.md`](./ARCHITECTURE-ELECTRON.md) | Backend local, renderer, IPC, SQLite e integração cloud |
| [`AUTHENTICATION.md`](./AUTHENTICATION.md) | OAuth/OIDC, sessões, access tokens e refresh tokens |
| [`HOW-IT-WORKS.md`](./HOW-IT-WORKS.md) | Fluxos de execução do desktop, importação, conciliação, notícias e backup |
| [`DATA_MODEL.md`](./DATA_MODEL.md) | Modelo conceitual local e remoto, invariantes e estratégia de evolução |
| [`ESTRUTURA_DE_DADOS.md`](./ESTRUTURA_DE_DADOS.md) | Regras operacionais de modelagem, migrations, consultas e escala para um milhão de usuários |
| [`API.md`](./API.md) | Convenções e contratos planejados para APIs locais e de borda |
| [`SECURITY.md`](./SECURITY.md) | Modelo de ameaças, tratamento de dados e requisitos obrigatórios |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Ambiente local, comandos, estrutura e critérios de validação |
| [`CLOUDFLARE_SETUP.md`](./CLOUDFLARE_SETUP.md) | Configuração ordenada do Worker, D1, migrations, segredos e integração com a Vercel |
| [`BEST_PRACTICES.md`](./BEST_PRACTICES.md) | Práticas gerais de engenharia e contribuição |
| [`BRANDING.md`](./BRANDING.md) | Identidade visual e regras de interface |
| [`DASHBOARD.md`](./DASHBOARD.md) | Padrões de dashboard e visualização de dados: referências, base teórica, auditoria e regras normativas |

## Produto e referências

- [`DOCUMENTACAO_PDF_REESCRITA.md`](./DOCUMENTACAO_PDF_REESCRITA.md): visão funcional consolidada que orienta o escopo, mas não substitui as fontes técnicas acima.
- [`PROJECT_THINKING.md`](./PROJECT_THINKING.md): registro inicial de decisões; pode conter hipóteses superadas.
- [`DOCUMENTACAO_PDF_TRANSCRICAO.md`](./DOCUMENTACAO_PDF_TRANSCRICAO.md): transcrição histórica, não normativa.
- `App de Gestão Financeira ARCA.pdf`: material de origem, não normativo.

## Hierarquia de decisão

Quando houver conflito, use esta ordem:

1. código, testes e configuração versionados;
2. documentos técnicos deste índice;
3. visão consolidada do produto;
4. documentos históricos e transcrições.

Conflitos devem ser corrigidos na fonte, não explicados apenas em comentários de código.

## Estados usados

- **Atual:** existe e pode ser verificado no repositório.
- **Planejado:** decisão aceita, ainda sem implementação completa.
- **Em aberto:** depende de validação, ADR ou decisão do mantenedor.

## Atualização da documentação

Mudanças gerais de arquitetura atualizam `ARCHITECTURE.md` e a arquitetura específica afetada; mudanças de fluxo atualizam `HOW-IT-WORKS.md`; mudanças de persistência atualizam `DATA_MODEL.md`; mudanças de autenticação atualizam `AUTHENTICATION.md` e `SECURITY.md`; mudanças em painéis, indicadores ou gráficos atualizam `DASHBOARD.md` e, quando tocarem em tokens visuais, também `BRANDING.md`. Decisões com alternativas relevantes ganham ADR em `docs/decisions/`.

## Decisões registradas

| ADR | Assunto |
| --- | --- |
| [`0001-web-hosting.md`](./decisions/0001-web-hosting.md) | Hospedagem da LP na Vercel e do backend em Cloudflare Workers |
| [`0002-leitor-ofx-proprio.md`](./decisions/0002-leitor-ofx-proprio.md) | Leitor OFX próprio em vez de `ofx-data-extractor` |
