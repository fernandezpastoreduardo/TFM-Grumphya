#!/usr/bin/env bash
set -euo pipefail
umask 077

MODE=${1:-all}
case "$MODE" in
  all|quality|e2e|audit) ;;
  *) echo "Usage: ci-local.sh [all|quality|e2e|audit]" >&2; exit 2 ;;
esac

preserve_browser_artifacts() {
  mkdir -p /artifacts/playwright
  cp -a apps/web/test-results/. /artifacts/playwright/test-results/ 2>/dev/null || true
  cp -a apps/web/playwright-report/. /artifacts/playwright/report/ 2>/dev/null || true
}
trap preserve_browser_artifacts EXIT

cp -a /source/. /workspace/
node --version
pnpm --version
if [[ "$MODE" == all || "$MODE" == quality ]]; then
  bash scripts/ci-preflight.sh
fi
pnpm install --frozen-lockfile

if [[ "$MODE" == all || "$MODE" == quality ]]; then
  export TEST_DATABASE_URL=postgresql://grumphya_test:grumphya_test@postgres:5432/grumphya_test
  for variable in \
    ANONYMOUS_USAGE_TEST_DATABASE_URL REGISTRATION_TEST_DATABASE_URL \
    WORST_IDEAS_USER_TEST_DATABASE_URL WORST_IDEAS_RANKING_TEST_DATABASE_URL \
    USER_DELETE_TEST_DATABASE_URL CONTACT_MESSAGE_TEST_DATABASE_URL \
    BEST_USERS_TEST_DATABASE_URL ADMIN_DASHBOARD_TEST_DATABASE_URL \
    APPROVED_IDEAS_TEST_DATABASE_URL; do
    export "$variable=$TEST_DATABASE_URL"
  done
  export ACCESS_TOKEN_SECRET=ci-only-secret-with-more-than-32-bytes
  pnpm ci:verify quality
fi

if [[ "$MODE" == all || "$MODE" == e2e ]]; then
  pnpm ci:verify e2e
fi

if [[ "$MODE" == all || "$MODE" == audit ]]; then
  pnpm ci:verify audit
fi
