# Estados vazios, de erro e de ausência

## Status

**Atual.** Mapa de todos os lugares do app local e da LP que podem aparecer sem informação, levantado no teste manual de 26 de outubro de 2026, com a ilustração flat de cada um.

## Ilustrações — atual

- **Origem:** ilustrações flat geradas no Gemini e fornecidas pelo mantenedor em JPEG de 1024 × 1024. Os JPEGs ficam fora do Git, em `design/estados-fonte/` (ignorado), porque não são necessários para build nem execução.
- **Mestres vetoriais:** `design/estados-vetor/<chave>.svg`, vetorizados com filtro de mediana contra o ruído do JPEG, separação em camadas de cor chapada e traçado por curvas Bézier (potrace), empilhando da cor mais clara para a mais escura para não abrir frestas. São a fonte de verdade a partir de agora.
- **Variantes:** `pnpm estados:gerar` (`scripts/gerar-estados.mjs`) gera `public/estados/claro/`, `public/estados/escuro/` e, para as chaves da LP, `apps/web/public/estados/`. A placa sai e as áreas de papel recebem a cor exata da superfície onde a ilustração aparece (`#FFFDF8` no claro, `#2A2622` no escuro, `#F4F1EA` na LP), para que ela pareça integrada. No escuro, neutros invertem para o tom quente do texto claro e marrons sobem de luminosidade.
- **Comportamento:** `StateArt` (`src/components/state-art.tsx`) entrega as duas variantes e o CSS mostra só a do tema ativo. A imagem é decorativa (`alt=""`), não pode ser arrastada (`draggable={false}`, `dragstart` cancelado, `-webkit-user-drag: none`) nem selecionada (`user-select: none`), e deixa o clique passar (`pointer-events: none`).
- **Validação:** sempre nos dois temas, conforme `CLAUDE.md`. Testes em `tests/regression/state-art.test.mjs`.
- **Integridade (27 de outubro de 2026):** todas as ilustrações foram revisadas nos dois temas contra os originais. O fundo é removido só onde a cor é praticamente a do papel, para não engolir objetos claros sem contorno (o cartão de `sem-cartoes` e a folha de `importar-extrato` saíam cortados). A folha de `importar-extrato` foi redesenhada no mestre, porque o creme dela é indistinguível do papel do original. O chão de `nao-encontrada`, cortado reto pelo limite da imagem gerada, fecha em meia-lua: recorte elíptico, preenchimento de areia e contorno. No escuro, neutros claros viram creme apagado em vez de sumir no fundo. Testes em `tests/regression/state-art-integrity.test.mjs`.
- `nova-versao` foi desenhada direto em vetor para o aviso de atualização planejado em [`ATUALIZACOES.md`](./ATUALIZACOES.md); ainda não aparece na interface.

## Regras

1. "Nenhum" só aparece quando o backend confirmou zero (R-29 de [`DASHBOARD.md`](./DASHBOARD.md)). Telas de área consultam `GET /api/local-summary` antes de afirmar ausência.
2. Todo estado vazio tem uma frase que explica a ausência e, quando houver, uma ação.
3. Erro nunca mostra valor nem detalhe técnico; oferece repetição ou caminho de volta.
4. A ilustração é acessório: o texto se sustenta sozinho e a imagem leva `alt=""`.

## Mapa

| Lugar | Rota ou componente | Quando aparece | Chave de ilustração |
| --- | --- | --- | --- |
| Base financeira vazia | `/dashboard` · `EmptyState` | sem perfil ou sem nenhum dado gravado | `base-vazia` |
| Indicadores indisponíveis | `/dashboard` · `ErrorState` e telas de área | consulta ao banco local falhou | `falha-consulta` |
| Gastos por categoria vazios | `/dashboard` · `CategoryChart` | backend confirmou zero gasto no período | `sem-gastos` |
| Lançamentos | `/extratos` | nenhuma transação gravada | `sem-lancamentos` |
| Cartões | `/extratos/cartoes` e detalhe | nenhum cartão; ID inexistente | `sem-cartoes` |
| Importação | `/extratos/importar`, lote e diálogo de importação | nenhum arquivo; lote inexistente | `importar-extrato` |
| Obrigações | `/extratos/recorrencias` | nenhuma obrigação aberta | `sem-obrigacoes` |
| Conciliação | `/conciliacao` | nenhum lançamento pendente | `nada-a-conciliar` |
| Conferência de fatura | `/conciliacao/faturas` | nenhuma fatura | `sem-faturas` |
| Patrimônio e aportes | `/patrimonio`, `/patrimonio/aportes` | nenhum ativo cadastrado | `sem-patrimonio` |
| Metas | `/patrimonio/metas` e detalhe | nenhuma meta; ID inexistente | `sem-metas` |
| Notícias | `/invest` e artigo | integração não configurada; ID inexistente | `sem-noticias` |
| Histórico | `/historico` | nenhum evento | `historico-vazio` |
| Perfil | `/perfil` | onboarding não concluído | `perfil-vazio` |
| Notificações | gaveta de notificações | nenhum alerta gerado | `sem-notificacoes` |
| Contas | diálogo do seletor de conta | nenhuma conta | `sem-contas` |
| Página não encontrada | `src/app/not-found.tsx`, `apps/web/src/app/not-found.tsx` | rota inexistente | `nao-encontrada` |
| Erro de tela | `src/app/error.tsx`, `apps/web/src/app/error.tsx` | falha ao renderizar | `erro-tela` |
| Downloads | `/downloads` na LP | nenhuma versão publicada | `sem-versoes` |

## Direção das ilustrações

Flat, sem gradiente, sem sombra e sem textura; paleta quente coerente com a marca; traço geométrico; nenhum texto, dado financeiro, pessoa real ou logotipo de terceiro. Novas ilustrações entram como mestre em `design/estados-vetor/` com o papel em `#F4F1EA`, e as variantes são sempre geradas pelo script.
