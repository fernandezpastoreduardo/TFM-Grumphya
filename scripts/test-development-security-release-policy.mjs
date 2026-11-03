import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const WORKFLOW = ".github/workflows/ci.yml";
const DEPLOY_HELPER = "docker/vps-deploy.sh";
const OVERLAY = "compose.development-security.production.yaml";
const [workflow, deployHelper, overlay] = await Promise.all([
  readFile(WORKFLOW, "utf8"),
  readFile(DEPLOY_HELPER, "utf8"),
  readFile(OVERLAY, "utf8"),
]);

assert.match(
  workflow,
  /enable_development_security:[\s\S]*?type: boolean[\s\S]*?default: false/u,
  "DS deployment must be an explicit, disabled-by-default workflow input",
);
assert.match(
  workflow,
  /DEVELOPMENT_SECURITY_ENABLED=1/u,
  "release metadata must enable DS through its explicit switch",
);
assert.match(
  workflow,
  /compose\.development-security\.production\.yaml/u,
  "the bundle must include the optional DS Compose overlay",
);
assert.match(
  workflow,
  /DEVELOPMENT_SECURITY_DATABASE_IMAGE/u,
  "the isolated DS database image must be accounted for in release handling",
);
assert.match(
  workflow,
  /\$\{\{ inputs\.enable_development_security \}\}" == "true"/u,
  "DS release assembly and deployment must be gated by the opt-in input",
);
assert.match(
  workflow,
  /if \[\[ "\$\{\{ inputs\.enable_development_security \}\}" == "true" \]\]; then[\s\S]*?mkdir -p release\/development-security-migrations[\s\S]*?cp apps\/prototype-desarrollo-seguro\/prototype-desarrollo-seguro-persistence\/migrations\/\*\.sql release\/development-security-migrations\/[\s\S]*?bundle_paths\+=\(compose\.development-security\.production\.yaml development-security-migrations\)/u,
  "an opted-in release must ship all DS migrations inside its release bundle",
);
assert.match(
  workflow,
  /ENABLE_DEVELOPMENT_SECURITY[^\n]*[\s\S]{0,800}required_helper_version=3/u,
  "an enabled DS release must require a helper that understands its overlay",
);
const publicHealthStart = workflow.indexOf(
  'echo "Release accepted by VPS; checking public application endpoints."',
);
assert.ok(
  publicHealthStart >= 0,
  "post-deploy public health checks must exist",
);
const postDeployChecks = workflow.slice(publicHealthStart);
assert.match(
  postDeployChecks,
  /if \[\[ "\$ENABLE_DEVELOPMENT_SECURITY" == "true" \]\]; then[\s\S]*?curl --fail[^\n]*\/desarrollo-seguro\/app[\s\S]*?curl --fail[^\n]*\/api\/desarrollo-seguro\/v1\/health[\s\S]*?health\.status !== "ok"/u,
  "enabled DS releases must verify the public portal and API health endpoint",
);

assert.match(
  deployHelper,
  /DEVELOPMENT_SECURITY_ENABLED/u,
  "the helper must validate the optional DS release switch",
);
assert.match(
  deployHelper,
  /compose\.development-security\.production\.yaml/u,
  "the helper must validate and apply the optional DS overlay",
);
assert.match(
  overlay,
  /development-security-postgres/u,
  "DS rollback must preserve a separately named persistent database volume",
);
assert.match(
  deployHelper,
  /rm --stop --force[\s\S]*development-security-api[\s\S]*development-security-database[\s\S]*development-security-migrate/u,
  "rollback must remove only DS service containers",
);
assert.doesNotMatch(
  deployHelper,
  /down\s+--volumes/u,
  "rollback must never remove persistent volumes",
);

process.stdout.write("Development security release policy passed.\n");
