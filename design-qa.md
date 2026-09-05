# Design QA — layout desktop

- source visual truth path: `Aplicativo desktop com formulário.zip` (`Talentum.dc.html`)
- implementation: aplicação Next.js local na porta 3000
- viewport alvo: 1440 × 900 CSS px; mínimo documentado de 1024 × 700
- source dimensions: protótipo HTML responsivo, sem dimensão raster fixa
- implementation dimensions: não capturadas
- state: tema claro, dados sintéticos

## Full-view comparison evidence

Bloqueada: o navegador integrado não estava disponível nesta sessão. A referência foi inspecionada como HTML/CSS, mas o fluxo obrigatório exige captura renderizada de ambos os lados para comparação visual.

## Focused region comparison evidence

Bloqueada pelo mesmo motivo. Foram comparados estruturalmente tokens, rotas, textos, componentes, estados e interações do HTML-fonte com a implementação React, sem substituir isso por uma afirmação de fidelidade visual.

## Findings

- P2: falta evidência renderizada do dashboard, navegação, modais, tema escuro e viewport mínimo.
- P2: interações primárias não puderam ser exercitadas em navegador nem o console pôde ser verificado.

## Comparison history

- Iteração estrutural: o shell, as rotas do protótipo, os overlays, dados sintéticos e estados interativos foram convertidos para Next.js/React.
- Verificação técnica: `pnpm typecheck` e `pnpm build` passaram.
- Verificação visual: bloqueada por indisponibilidade do navegador integrado.

## Implementation checklist

- Capturar a referência e a implementação em 1440 × 900.
- Comparar tipografia, ritmo, cores, assets e copy na mesma imagem de comparação.
- Exercitar navegação, filtros, triagem, importação, overlays, temas e estados globais.
- Verificar o console e repetir a captura em 1024 × 700.

final result: blocked
