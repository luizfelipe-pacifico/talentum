FROM node:22-bookworm-slim AS node-runtime

FROM ubuntu:24.04 AS base
COPY --from=node-runtime /usr/local/ /usr/local/
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable pnpm
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
ENV TALENTUM_STANDALONE_BUILD=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma:generate
RUN pnpm build \
    && pnpm prune --prod

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app nextjs \
    && mkdir -p /data \
    && chown nextjs:nodejs /data
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# A thread de leitura de PDF não é rastreada pelo standalone (tests/regression/pdf-worker-missing-from-standalone.test.mjs).
COPY --from=builder --chown=nextjs:nodejs /app/.next/server/chunks ./.next/server/chunks
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
USER nextjs
EXPOSE 3000
# Sem `prisma migrate deploy` nem script de preparação: o banco no volume é
# cifrado e só abre com a senha. No desbloqueio, o backend aplica a restauração
# agendada, cria o ponto de restauração pre_migration e aplica as migrations pela
# conexão cifrada (src/server/backup/startup.ts). O cofre (talentum-local.vault),
# a chave do dispositivo e talentum-backups/ ficam no mesmo volume.
CMD ["node", "server.js"]
