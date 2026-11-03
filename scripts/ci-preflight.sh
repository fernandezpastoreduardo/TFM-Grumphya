#!/usr/bin/env bash
set -euo pipefail

node scripts/test-container-security-policy.mjs
node scripts/test-development-security-production-smoke-policy.mjs
node scripts/test-development-security-compose-policy.mjs
node scripts/test-development-security-release-policy.mjs
node scripts/test-development-security-tls.mjs
node scripts/test-internal-tls.mjs
node scripts/test-ci-local.mjs
