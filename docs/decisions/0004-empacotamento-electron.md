# ADR 0004 — Empacotamento desktop com electron-builder

## Status

Aceita em 2026-09-12.

## Contexto

O MVP precisa produzir instalador NSIS para Windows e AppImage para Linux. O pacote deve incluir o servidor Next.js standalone, Prisma, migrations e o shell Electron, sem depender de Node ou pnpm instalados na máquina da pessoa.

## Decisão

Usar `electron-builder`. `scripts/desktop-prepare.mjs` gera a saída standalone e copia os recursos estáticos exigidos pelo Next.js. No pacote, o processo principal aplica migrations versionadas no SQLite dentro de `app.getPath('userData')`, inicia o servidor com o runtime Node embutido no Electron e só abre a janela depois do healthcheck.

Artefato gerado localmente é **não assinado** e serve apenas para teste. Release pública exige assinatura de código configurada no ambiente protegido da pipeline, checksum SHA-256 e publicação dos metadados correspondentes.

## Alternativas

- Electron Forge: adequado, mas adicionaria outra camada de configuração sem vantagem para os dois alvos atuais.
- instalador artesanal: rejeitado por aumentar risco de atualização, desinstalação e assinatura incorretas.
- exigir Docker/Node no computador final: rejeitado; deixa de ser um aplicativo desktop instalável.

## Consequências

- builds Windows e Linux rodam no sistema operacional de destino;
- certificados e senhas nunca entram no repositório;
- a ausência de assinatura continua visível e impede classificar o artefato de teste como release;
- `release/` permanece ignorado pelo Git.
