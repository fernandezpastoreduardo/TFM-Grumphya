FROM node:24.20.0-bookworm-slim

ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN mkdir -p /workspace/var/avatars && chown -R node:node /workspace

USER node

EXPOSE 3000 5173
