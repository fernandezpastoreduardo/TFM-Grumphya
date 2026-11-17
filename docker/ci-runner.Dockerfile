ARG NODE_VERSION=26.13.0
ARG PNPM_VERSION=12.5.1
ARG PLAYWRIGHT_VERSION=1.65.1

FROM node:${NODE_VERSION}-trixie-slim AS node-runtime

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

ARG PNPM_VERSION=12.5.1

COPY --from=node-runtime /usr/local/ /usr/local/
RUN npm install --global pnpm@${PNPM_VERSION} \
  && test "$(pnpm --version)" = "$PNPM_VERSION" \
  && useradd --create-home --shell /usr/sbin/nologin node \
  && useradd --system --no-create-home --home-dir /var/lib/postgresql \
    --shell /usr/sbin/nologin postgres \
  && mkdir -p /workspace /artifacts \
  && chmod 0755 /workspace /artifacts

COPY scripts/ci-runner-entrypoint.sh /usr/local/bin/ci-runner-entrypoint
RUN chmod 0555 /usr/local/bin/ci-runner-entrypoint

ENV CI=true
WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/ci-runner-entrypoint"]
