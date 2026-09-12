# ADR 0002 — Leitor OFX próprio em vez de `ofx-data-extractor`

- Status: aceita
- Data: 2026-09-12

## Contexto

`docs/DEVELOPMENT.md` registrava que o genérico “Node-OFX” do documento-fonte
havia sido concretizado como a dependência `ofx-data-extractor`, “com tipos,
normalização e validação”. A dependência estava declarada no `package.json`,
mas nenhum código a usava: a importação de extrato (Feature 4 de
[`ROUTING_MVP.md`](../ROUTING_MVP.md)) ainda não existia.

Ao implementar a Feature 4, a biblioteca foi exercitada pela primeira vez com
arquivos OFX representativos. Duas limitações apareceram.

### 1. Falha em OFX 1.x/SGML

O padrão OFX tem duas serializações. A versão 1.x é SGML e permite que tags de
folha fiquem **sem fechamento** — `<TRNAMT>-100.50` termina no próximo `<`. É a
serialização que os bancos brasileiros exportam.

Diante de um arquivo assim, `ofx-data-extractor` monta o JSON por concatenação
de texto, aninha `STMTRS` dentro de `STATUS` e produz um documento inválido.
`toNormalized()` lança `SyntaxError: Expected ',' or '}' after property value in
JSON` durante a análise. Um arquivo OFX 2.x, em XML com todas as tags fechadas,
é lido corretamente — mas esse não é o formato que o MVP precisa ler.

### 2. Dinheiro em ponto flutuante

A saída normalizada expõe o valor como `number`:

```json
{ "amount": -100.5, "amountAbs": 100.5, "raw": { "TRNAMT": "-100.50" } }
```

[`DATA_MODEL.md`](../DATA_MODEL.md) determina que “valores monetários usam
centavos inteiros ou `Decimal`, nunca `Float`”, e
[`DASHBOARD.md`](../DASHBOARD.md), R-25, exige `BigInt` em centavos até a borda
de apresentação. Consumir o campo normalizado violaria as duas regras. O campo
`raw.TRNAMT` preserva o texto original, mas usar só o `raw` significa não usar a
normalização — que era a razão de adotar a biblioteca.

## Opções

### A. Manter a biblioteca e tratar as duas limitações

Converter SGML em XML antes de entregar o arquivo e ler apenas `raw.TRNAMT`.
Exige um pré-processador de SGML — ou seja, exige escrever justamente a parte
difícil — e ainda mantém a superfície da dependência.

### B. Trocar por outra biblioteca de OFX

Nenhuma alternativa no ecossistema reúne suporte a SGML, valor exato e
manutenção ativa. Trocar por outra dependência apenas desloca o risco.

### C. Ler o subconjunto necessário no próprio projeto

O MVP precisa de quatro coisas do arquivo: a lista de `STMTTRN`, o período
declarado, o saldo final e a identificação da conta. O formato dessas quatro é
estável desde o OFX 1.0.

## Decisão

Adotar a opção **C**. `src/server/import/ofx.ts` lê o subconjunto necessário do
OFX, cobrindo SGML (1.x) e XML (2.x) com o mesmo padrão de extração, porque em
ambos o valor de uma tag de folha termina no próximo `<`.

`ofx-data-extractor` é removida de `package.json`.

## Consequências

Positivas:

- os arquivos que os bancos brasileiros realmente exportam passam a ser lidos;
- o valor permanece texto até `parseAmountCents`, que devolve `BigInt` em
  centavos — não existe caminho de ponto flutuante para dinheiro;
- o parser é limitado e auditável, alinhado à exigência de “parser isolado e
  limitado” de [`SECURITY.md`](../SECURITY.md): ele não executa conteúdo
  embutido, não resolve entidades externas e respeita os tetos de
  `src/server/import/limits.ts`;
- uma dependência a menos na cadeia de suprimento.

Negativas e limites conhecidos:

- o leitor cobre extrato bancário (`STMTTRN` em `BANKMSGSRSV1`). Fatura de
  cartão (`CREDITCARDMSGSRSV1`), investimentos e múltiplos extratos no mesmo
  arquivo **não** estão cobertos; cartões são a Etapa 8 do
  [`ROADMAP.md`](../ROADMAP.md) e o leitor deve ser estendido lá;
- manutenção do parser passa a ser do projeto. O custo é contido pelos testes de
  `tests/import-ofx.test.mjs`, que fixam SGML, XML, entidades, data civil e
  lançamento ilegível.

## Verificação

`tests/import-ofx.test.mjs` cobre, com fixtures sintéticas:

- OFX 1.x/SGML com tags de folha sem fechamento — o caso que motivou o ADR;
- OFX 2.x/XML com entidades;
- valor sempre `BigInt`, nunca `number`;
- período, saldo e conta declarados pelo arquivo;
- lançamento ilegível registrado como problema, sem derrubar o lote;
- recusa de arquivo que não é OFX.
