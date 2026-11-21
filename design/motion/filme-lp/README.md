# Filme da landing page

Filme publicitário de 32 s (16:9) exibido abaixo do herói da LP. Feito com a skill `motion-product` do mantenedor: as telas do Talentum são redesenhadas em canvas a partir do código, sem prints, com dados fictícios. Regras e status em [DESIGN-SYSTEM.md, "Product film on the landing page"](../../../docs/DESIGN-SYSTEM.md#product-film-on-the-landing-page).

## Estrutura

- `fonte/telas.js`: casco, importação, conciliação e dashboard, com as medidas tiradas do DOM do aplicativo no servidor isolado de teste.
- `fonte/cenas.js`: o roteiro (dúvida do mês → CLAREZA → apresentação → importar, conciliar, saldo livre → o número que sobra → lema → slogan → marca).
- `fonte/audio.mjs`: trilha sintetizada; só a seção ARRANJO é do projeto.
- `fonte/kit.js`, `motor.js`, `render.mjs`, `film.html`: motor da skill, sem alteração.
- `assets/`: fontes do build (`@fontsource`), a marca e a ilustração de estado da importação.

## Dados

Os números são os que o próprio aplicativo calcula para estes dados fictícios: um extrato `extrato-ficticio.csv` com 18 lançamentos de novembro de 2026 (R$ 3.556,07 em conta) e três obrigações (fatura R$ 960,00, aluguel R$ 1.800,00, condomínio R$ 420,00), que dão R$ 376,07 de Saldo Livre de Risco. Nada pertence a alguém.

## Regenerar

Requer Node 22+, o Chromium do Playwright (`pnpm test:e2e:install`) e `ffmpeg` com libx264.

```bash
cd design/motion/filme-lp/fonte
node audio.mjs                         # trilha e grade de batidas
node render.mjs --colisao 1            # reprova texto sobre herói e herói cortado
node render.mjs --marcos ../rodadas/marcos.png
node render.mjs                        # master em ../resultados/talentum-filme.mp4
```

Versão da LP (30 fps, cerca de 3,7 MB) e capa:

```bash
ffmpeg -i ../resultados/talentum-filme.mp4 -vf fps=30 -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 128k ../../../../apps/web/public/video/talentum-filme.mp4
ffmpeg -ss 16.9 -i ../resultados/talentum-filme.mp4 -frames:v 1 -vf scale=1600:-2 -c:v libwebp -quality 82 \
  ../../../../apps/web/public/video/talentum-filme-capa.webp
```
