#!/usr/bin/env bash
set -euo pipefail

node scripts/test-container-security-policy.mjs
node scripts/test-internal-tls.mjs
node scripts/test-ci-local.mjs
