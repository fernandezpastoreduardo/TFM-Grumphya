#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-}
if [[ "$MODE" != quality && "$MODE" != e2e && "$MODE" != audit ]]; then
  echo "Usage: pnpm ci:verify <quality|e2e|audit>" >&2
  exit 2
fi

if [[ "$MODE" == quality ]]; then
  pnpm --filter @grumphya/api exec tsx scripts/prepare-test-database.ts
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--no-experimental-webstorage"
  pnpm quality:check
  node scripts/test-deploy-policy.mjs
  node scripts/test-sonarqube-gate.mjs
  node scripts/test-pre-push-hook.mjs
  bash -n docker/vps-deploy.sh scripts/test-vps-deploy.sh
  bash scripts/test-vps-deploy.sh
elif [[ "$MODE" == e2e ]]; then
  pnpm test:e2e
else
  pnpm audit --audit-level moderate
  pnpm audit --prod --audit-level high
fi
