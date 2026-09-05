# Segurança e privacidade do Talentum

## Caráter obrigatório

Este documento é normativo para autenticação, APIs, arquivos, banco de dados, logs, IA e backup. Funcionalidades financeiras não devem ser distribuídas enquanto seus controles essenciais não estiverem implementados e testados.

## Dados protegidos

- extratos e faturas originais;
- transações, descrições, estabelecimentos e categorias;
- saldos, patrimônio, metas e hábitos;
- identidade, e-mail e identificadores OAuth;
- banco SQLite, backups e chaves;
- tokens, cookies, códigos de autorização e segredos de infraestrutura.

## Modelo de ameaças inicial

| Ameaça | Controle mínimo |
| --- | --- |
| Arquivo malicioso | limites de tamanho, detecção real de tipo, parser isolado e timeout |
| API local acessada por outro processo | bind em loopback, origem controlada e segredo efêmero por sessão |
| Roubo do banco local | permissões do sistema, opção de cifragem e ausência de dados em logs |
| Furto do backup remoto | AES-256-GCM no cliente e chave ausente do servidor |
| Sequestro de OAuth | PKCE, `state`, nonce, redirect estrito e tokens curtos |
| Dependência comprometida | lockfile, revisão, alertas e atualização controlada |
| Conteúdo de notícia hostil | sanitização, CSP e abertura externa segura de links |
| Prompt injection em notícia | separar instruções de conteúdo e não disponibilizar ferramentas ou dados privados ao modelo |

## Regras obrigatórias

1. Nunca versionar, imprimir ou enviar segredos para ferramentas, logs ou documentação.
2. Nunca enviar dados financeiros para Workers AI ou outro modelo externo.
3. Não carregar conteúdo remoto com privilégios do Electron.
4. Manter `contextIsolation: true`, `nodeIntegration: false` e uma CSP restritiva.
5. Validar toda entrada novamente no processo confiável; a interface não é fronteira de segurança.
6. Usar consultas parametrizadas via Prisma e validação de autorização independente.
7. Redigir logs: IDs técnicos e estados são permitidos; valores financeiros e descrições não.
8. Criptografar em trânsito e em repouso, mas nunca enviar ao frontend dado confidencial desnecessário, mesmo cifrado.
9. Aplicar autorização por recurso e proprietário no backend em toda requisição.
10. Tratar posts e comentários como entrada hostil: validar tamanho/schema, escapar na saída e aplicar CSP.
11. Exigir código de ação efêmero e de uso único em toda chamada frontend-backend, exceto na rota que emite o próprio código.

## Código efêmero de ação

- gerar no backend com CSPRNG e entropia mínima equivalente a 128 bits;
- armazenar somente hash e metadados mínimos em KV/Durable Object ou memória local com TTL máximo inicial de 60 segundos;
- vincular a método, rota, origem/contexto e sessão quando houver;
- consumir atomicamente uma única vez e remover após consumo/expiração;
- nunca incluir o código em URL, telemetria, analytics, logs ou banco histórico;
- nunca inserir identidade ou informação de negócio no valor;
- aplicar `Cache-Control: no-store` na emissão e no consumo;
- responder com erro genérico sem revelar se o código existiu;
- manter autenticação, autorização, CSRF, rate limit e idempotência independentes.

## Controles por ambiente

| Controle | Web/Worker | Electron |
| --- | --- | --- |
| TLS/HSTS | obrigatório | obrigatório nas conexões cloud |
| CSP, anti-XSS e sanitização | obrigatório | obrigatório no renderer |
| CSRF | mutações por cookie | fluxo OAuth via `state`/PKCE |
| Rate limit/WAF/Turnstile | borda e aplicação | backend cloud; limite também na API local |
| Tokens | cookie HttpOnly/BFF e rotação | access em memória, refresh no cofre do SO |
| Banco | D1 com autorização por linha/recurso na aplicação | SQLite acessado só pelo backend local |
| Segredos | bindings/secret store, nunca bundle | nenhum client secret; chaves locais protegidas pelo SO |
| Integridade de software | CI, dependências e artefatos | assinatura de código, update e manifesto |
| Isolamento | headers, CORS e cache | sandbox, context isolation, IPC mínimo e fuses |
| Auditoria | login, sessão, moderação e download | eventos técnicos locais sem finanças |

## Isolamento do deploy Vercel

- `talentum.vercel.app` contém apenas LP, página de downloads e BFF mínimo de sessão;
- nenhum fonte Electron, backend local, Prisma/SQLite, parser ou módulo financeiro entra no upload/contexto de build;
- o CI gera e valida um manifesto allowlist do pacote destinado à Vercel;
- o BFF não possui banco nem regra financeira e só encaminha contratos permitidos ao Worker;
- instaladores são artefatos assinados em GitHub Releases, nunca parte do bundle executável da LP; o D1 guarda apenas metadados e concessões;
- previews seguem o mesmo isolamento e não recebem segredos de produção.

## Comunidade de feedback

- leitura anônima inclui somente conteúdo `PUBLISHED` e perfil público mínimo;
- escrita, voto e denúncia exigem sessão válida;
- autor só altera o próprio conteúdo; moderador usa permissão explícita;
- votos têm restrição única e contadores são derivados/transacionais;
- posts e comentários têm limites de tamanho, normalização, escape contextual e bloqueio de HTML bruto no MVP;
- aplicar antispam, cooldown, Turnstile adaptativo, denúncia e fila de moderação;
- respostas e logs nunca expõem e-mail, IP, token, subject OAuth ou eventos privados;
- URLs são validadas e renderizadas com proteção contra `javascript:`, phishing e reverse tabnabbing;
- exclusão, retenção e recurso de moderação devem ter política publicada.

## Prevenção de vazamento de credenciais

- `.env`, bancos, certificados e chaves privadas permanecem ignorados;
- exemplos usam apenas placeholders inequívocos;
- CI executa secret scanning no diff e, periodicamente, no histórico completo;
- branch protection bloqueia merge quando o scanner detecta segredo;
- dependabot/renovate, SAST, análise de dependências e CodeQL são recomendados;
- credencial detectada é revogada e rotacionada antes da remoção do histórico;
- não imprimir o valor encontrado em issue, log ou comentário de revisão.

### Auditoria de 2026-09-05

Foi feita varredura local por nomes sensíveis, chaves privadas e formatos conhecidos de tokens no worktree e histórico. Não foi identificada credencial textual real. Correspondências em `icon-badge.svg` e PNGs históricos foram classificadas como sequências casuais dentro de imagens codificadas/binárias. A auditoria por padrões reduz risco, mas não substitui um scanner dedicado no CI nem a proteção de segredos do GitHub.

## OAuth desktop

O fluxo deve seguir Authorization Code com PKCE, navegador do sistema e redirect permitido para aplicativo instalado. Tokens devem ficar em armazenamento seguro do sistema operacional quando disponível, nunca no `localStorage`. Logout revoga ou remove credenciais locais sem apagar dados financeiros por surpresa.

## Backup E2EE

- algoritmo: AES-256-GCM ou construção autenticada equivalente revisada;
- nonce único por cifragem;
- chave derivada ou gerada no dispositivo e nunca enviada ao servidor;
- cabeçalho versionado com algoritmo, KDF, salt, nonce e checksum;
- restauração validada antes de substituir o banco ativo;
- mecanismo explícito de recuperação de chave ainda precisa ser decidido.

Sem uma estratégia de recuperação documentada, backup E2EE não deve ser apresentado como pronto.

## Electron

- expor por preload apenas funções específicas e validadas;
- negar navegação e criação de janelas não previstas;
- abrir links externos somente após validar protocolo e destino;
- aplicar atualizações assinadas quando distribuição automática existir;
- não aceitar certificados inválidos nem desabilitar proteções do Chromium.

## Resposta a incidentes

Uma suspeita de exposição exige: interromper a distribuição afetada, preservar evidências sem copiar dados pessoais, revogar credenciais, corrigir a causa, comunicar o impacto com clareza e documentar medidas preventivas.

## Checklist de release

- [ ] Nenhum segredo ou dado pessoal no Git, bundle, logs ou documentação.
- [ ] Dependências e artefatos verificados.
- [ ] Fluxos OAuth e autorização testados.
- [ ] Parsers testados com arquivos inválidos e hostis.
- [ ] Backup e restauração testados ponta a ponta.
- [ ] CSP, permissões Electron e abertura de links revisadas.
- [ ] Exportação e exclusão de dados verificadas.
- [ ] Secret scanning do diff e histórico aprovado sem credenciais reais.
- [ ] Rate limits, antispam, denúncias e autorização da comunidade testados.
