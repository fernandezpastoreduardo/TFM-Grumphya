FROM node:26.13.0-trixie-slim AS node-base

WORKDIR /workspace

FROM node-base AS pnpm-base

RUN npm install --global pnpm@12.5.1

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

# Keep PostgreSQL on the same Debian release for the existing data volume.
# Rebuild gosu with a patched Go toolchain instead of excluding it from Trivy.
FROM golang:1.27.3-alpine AS gosu-build
RUN apk add --no-cache git \
  && git clone --depth 1 --branch 1.19 https://github.com/tianon/gosu.git /gosu \
  && test "$(git -C /gosu rev-parse HEAD)" = 6456aaa0f3c854d199d0f037f068eb97515b7513 \
  && cd /gosu \
  && CGO_ENABLED=0 go build -trimpath -o /out/gosu .

FROM pgvector/pgvector:0.8.7-pg17 AS database-production
COPY --from=gosu-build /out/gosu /usr/local/bin/gosu
COPY docker/postgres-entrypoint.sh /usr/local/bin/grumphya-postgres-entrypoint.sh
COPY docker/postgres-pg_hba.conf /etc/postgresql/pg_hba.conf
COPY docker/initdb/000-provision-runtime-role.sh /docker-entrypoint-initdb.d/000-provision-runtime-role.sh
COPY docker/postgres-backup.sh /usr/local/bin/grumphya-postgres-backup.sh
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && gosu nobody true \
  && chmod 0555 /usr/local/bin/grumphya-postgres-entrypoint.sh \
  /docker-entrypoint-initdb.d/000-provision-runtime-role.sh \
  /usr/local/bin/grumphya-postgres-backup.sh \
  /etc/postgresql/pg_hba.conf
ENTRYPOINT ["/usr/local/bin/grumphya-postgres-entrypoint.sh"]
CMD ["postgres"]

FROM pnpm-base AS web-build

ARG DEPLOY_SHA=local

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN printf '{"revision":"%s"}\n' "$DEPLOY_SHA" > apps/web/public/build.json
RUN pnpm --filter @grumphya/web build

FROM nginx:1.30-alpine AS web-production
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
RUN apk upgrade --no-cache \
  && apk add --no-cache openssl \
  && mkdir -p /run/secrets \
  && openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
    -keyout /run/secrets/web_tls.key -out /run/secrets/web_tls.crt \
    -subj "/CN=web" \
  && nginx -t \
  && rm -rf /run/secrets/web_tls.key /run/secrets/web_tls.crt
COPY --from=web-build /workspace/apps/web/dist /usr/share/nginx/html
COPY --from=web-build /workspace/prototype /usr/share/nginx/html/desarrollo-seguro
EXPOSE 8443

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
COPY --chown=node:node docker/database-entrypoint.sh /workspace/docker/database-entrypoint.sh
COPY --chown=node:node docker/admin-provision-entrypoint.sh /workspace/docker/admin-provision-entrypoint.sh

RUN mkdir -p /workspace/var/avatars \
  && chown -R node:node /workspace/var \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /opt/yarn-v1.22.22 /usr/local/bin/npm /usr/local/bin/npx \
    /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    /usr/local/bin/pnpm /usr/local/bin/pnpx

USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
