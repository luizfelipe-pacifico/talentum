# Arquitetura Electron

## Objetivo

O desktop é local-first: processa e guarda dados financeiros no dispositivo. O renderer é um frontend não confiável e só conversa com o backend local. Serviços cloud recebem apenas o mínimo documentado.

```mermaid
flowchart LR
    UI[Renderer sem Node] -->|loopback autenticado| API[Backend local]
    UI -->|IPC estreito| PRE[Preload]
    PRE --> MAIN[Electron main]
    API --> DOMAIN[Domínio]
    DOMAIN --> DB[(SQLite)]
    API -->|HTTPS + token| CLOUD[Backend Cloudflare]
```

## Fronteiras

- **Renderer:** `nodeIntegration: false`, `contextIsolation: true`, sandbox ativo e CSP restritiva.
- **Preload:** API mínima por método; nunca expõe `ipcRenderer`, filesystem ou shell genéricos.
- **Main:** valida remetente, argumentos, origem e destino em cada IPC.
- **Backend local:** bind em loopback, porta aleatória quando viável e segredo efêmero por execução.
- **SQLite:** acessível somente pela persistência do backend local.
- **Cloud:** acessível somente pelo backend local, nunca pelo renderer.

## Autenticação

O Electron é cliente público: nenhum client secret embutido é confidencial. Usa navegador do sistema, Authorization Code com PKCE S256, `state`, `nonce` e redirect registrado. Access token fica em memória; refresh token rotativo fica no cofre do sistema operacional quando disponível.

## Controles obrigatórios

1. Não carregar conteúdo remoto em janela privilegiada.
2. Negar navegação e novas janelas por padrão.
3. Validar allowlist antes de `shell.openExternal`.
4. Manter `webSecurity` e negar conteúdo misto.
5. Negar permissões não previstas.
6. Validar remetente e schema de todo IPC.
7. Preferir protocolo customizado seguro a `file://`.
8. Desabilitar recursos Electron não usados por fuses.
9. Assinar pacotes, atualizações e manifestos.
10. Nunca enviar finanças em claro à comunidade ou backend cloud.
