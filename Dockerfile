FROM node:24.21.0-trixie-slim AS node-base

WORKDIR /workspace

FROM node-base AS pnpm-base

ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate

FROM pnpm-base AS development

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN mkdir -p /workspace/var/avatars && chown -R node:node /workspace

USER node

EXPOSE 3000 5173

FROM development AS build

RUN pnpm --filter @grumphya/api build

FROM pnpm-base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --prod --filter @grumphya/api --frozen-lockfile --ignore-scripts

FROM node-base AS production

ENV NODE_ENV=production

COPY --from=production-dependencies --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY --from=production-dependencies /workspace/apps/api/package.json /workspace/apps/api/package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist /workspace/apps/api/dist
COPY --chown=node:node apps/api/migrations /workspace/apps/api/migrations
COPY --chown=node:node docker/api-entrypoint.sh /workspace/docker/api-entrypoint.sh

RUN mkdir -p /workspace/var/avatars \
  && chown -R node:node /workspace/var \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /opt/yarn-v1.22.22 /usr/local/bin/npm /usr/local/bin/npx \
    /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    /usr/local/bin/pnpm /usr/local/bin/pnpx

USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
