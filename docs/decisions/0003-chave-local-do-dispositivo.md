# ADR 0003 — Chave criptográfica local do dispositivo

- Status: aceita, com evolução prevista para o cofre do sistema operacional
- Data: 2026-09-12

## Contexto

A Feature 2 de [`ROUTING_MVP.md`](../ROUTING_MVP.md) guarda chaves PIX próprias
para reconhecer transferência entre contas da mesma pessoa.
[`ONBOARDING.md`](../ONBOARDING.md) é explícito sobre como isso deve ser feito:

> Um hash simples não basta para CPF, telefone e e-mail, pois o espaço de
> valores é previsível; usar HMAC com chave secreta do dispositivo para o índice
> de igualdade e criptografia autenticada para eventual recuperação/exibição.

A exigência é bem fundamentada. Um SHA-256 de CPF é reversível por força bruta
em segundos: existem apenas 10^11 combinações, e a tabela cabe num disco comum.
O mesmo vale para telefone celular brasileiro. Portanto o sistema precisa de um
**segredo** que não esteja no banco.

A questão é onde esse segredo mora.

## Opções

### A. Derivar de uma senha da pessoa usuária

Mais forte contra furto do dispositivo, porque o segredo não fica em lugar
nenhum quando o aplicativo está fechado. Mas exige que a pessoa digite a senha a
cada abertura, e perder a senha significa perder a capacidade de reconhecer as
próprias transferências. O MVP não tem fluxo de senha local, nem de recuperação,
e inventar um aqui seria criar requisito ausente.

### B. Guardar no cofre do sistema operacional

É o que [`ARCHITECTURE-ELECTRON.md`](../ARCHITECTURE-ELECTRON.md) já determina
para o refresh token. Tecnicamente correto e mais resistente.

O problema é arquitetural: o cofre é acessível ao processo principal do
Electron, e quem precisa da chave é o **backend local** — os Route Handlers do
Next.js. Ligar os dois exige um canal IPC novo, que hoje não existe e que
`ARCHITECTURE-ELECTRON.md` manda manter mínimo e validado. Além disso, o
aplicativo também roda por Docker e por `pnpm dev`, onde não há cofre nenhum.

### C. Guardar em arquivo próprio ao lado do banco

Segredo de 32 bytes em arquivo separado do SQLite, com permissão restrita, e
subchaves derivadas por HKDF para cada finalidade.

## Decisão

Adotar a opção **C**, com a opção **B** registrada como evolução.

`src/server/local-key.ts` mantém a chave mestra em `talentum-local.key`, no mesmo
diretório do banco — inclusive dentro do volume do Docker, que é o que preserva
os dois juntos entre recriações do container. O caminho é derivado do
`DATABASE_URL` pela mesma regra que o Prisma usa, e pode ser sobreposto por
`TALENTUM_LOCAL_KEY_FILE`.

Da chave mestra saem duas subchaves por HKDF-SHA256, com `info` distinto:

| Finalidade | Uso |
| --- | --- |
| `pix-index` | HMAC-SHA256 do valor normalizado, para comparação |
| `pix-value` | AES-256-GCM do valor normalizado, para exibição sob pedido |

Separar as finalidades importa: comprometer o índice de comparação não entrega a
chave de cifragem, e nenhuma das duas é a chave mestra.

## O que isto protege, e o que não protege

**Protege** contra furto do banco isolado: um `.db` copiado para outra máquina,
um backup esquecido numa pasta sincronizada, um arquivo anexado a um relatório
de erro. Sem o arquivo da chave, os identificadores são ilegíveis e o índice não
é reversível.

**Não protege** contra comprometimento do dispositivo inteiro. Quem lê o arquivo
do banco também lê o arquivo da chave. Isto está declarado no cabeçalho do
módulo e não deve ser apresentado de outro modo na interface.

O enquadramento é coerente com [`SECURITY.md`](../SECURITY.md), que trata "roubo
do banco local" com permissões do sistema e ausência de dados em log, e não
promete resistência a atacante com acesso total à máquina.

## Consequências

- a permissão `0600` é aplicada onde o sistema de arquivos suporta. No Windows a
  chamada é inócua e o controle efetivo é a ACL do diretório do usuário;
- `.gitignore` cobre `*.key` além de `temp/`, então a chave é ignorada por duas
  regras independentes;
- a chave é criada na primeira necessidade, com `wx`, de modo que dois processos
  concorrentes não gerem duas chaves e uma sobrescreva a outra;
- **perder o arquivo da chave torna os identificadores PIX ilegíveis.** Eles não
  são dado financeiro primário — podem ser cadastrados de novo —, mas a perda é
  silenciosa até alguém tentar ver uma chave. Um aviso na interface de backup
  pertence à Etapa 18 do [`ROADMAP.md`](../ROADMAP.md);
- migrar para o cofre do sistema operacional depois é possível sem mudar o
  formato gravado: bastaria mover a origem da chave mestra, mantendo o HKDF.

## Verificação

`tests/pix.test.mjs` cobre, com uma chave criada em diretório temporário:

- subchaves por finalidade distintas entre si;
- índice determinístico para a mesma chave escrita de formas diferentes;
- índice diferente de SHA-256 puro do valor — o ponto que motivou o ADR;
- ausência de colisão entre tipos para o mesmo dígito;
- cifragem reversível, com nonce próprio por operação;
- conteúdo adulterado falhando na tag de autenticação em vez de devolver lixo.
