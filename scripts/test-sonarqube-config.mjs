import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const COMPOSE_PATH = "compose.sonarqube.yaml";
const PROPERTIES_PATH = "sonar-project.properties";
const ANALYSIS_SCRIPT_PATH = "scripts/run-sonarqube-analysis.sh";
const PUSH_HOOK_PATH = ".husky/pre-push";
const PACKAGE_PATH = "package.json";
const GITIGNORE_PATH = ".gitignore";
const compose = await readFile(COMPOSE_PATH, "utf8");
const properties = await readFile(PROPERTIES_PATH, "utf8");
const analysisScript = await readFile(ANALYSIS_SCRIPT_PATH, "utf8");
const pushHook = await readFile(PUSH_HOOK_PATH, "utf8");
const workflow = await readFile(".github/workflows/ci.yml", "utf8");
const gitignore = await readFile(GITIGNORE_PATH, "utf8");
const packageJson = JSON.parse(await readFile(PACKAGE_PATH, "utf8"));
const gitMetadata = spawnSync("git", ["rev-parse", "--git-dir"]);
for (const name of ["sonarqube_settings", "sonarqube_token"]) {
  const secretPath = `.secrets/${name}`;
  const examplePath = `${secretPath}.example`;
  assert.match(gitignore, /^\.secrets\/\*$/m);
  assert.match(gitignore, /^!\.secrets\/\*\.example$/m);
  if (gitMetadata.status === 0) {
    const ignoredSecret = spawnSync("git", [
      "check-ignore",
      "--quiet",
      "--no-index",
      secretPath,
    ]);
    const ignoredExample = spawnSync("git", [
      "check-ignore",
      "--quiet",
      "--no-index",
      examplePath,
    ]);
    const trackedSecret = spawnSync("git", [
      "ls-files",
      "--error-unmatch",
      "--",
      secretPath,
    ]);
    assert.equal(
      ignoredSecret.status,
      0,
      `${secretPath} must be ignored by Git`,
    );
    assert.equal(
      trackedSecret.status,
      1,
      `${secretPath} must not be tracked by Git`,
    );
    assert.equal(
      ignoredExample.status,
      1,
      `${examplePath} must remain trackable`,
    );
  }
  await readFile(examplePath, "utf8");
}
const databaseSection = compose.match(
  /^  database:\n([\s\S]*?)(?=^  sonarqube:)/m,
)?.[1];

assert.match(compose, /sonarqube:\n[\s\S]*?image: sonarqube:[^\n]*community/);
assert.match(compose, /SONAR_TELEMETRY_ENABLE:\s*"false"/);
assert.match(compose, /SONAR_UPDATECENTER_ACTIVATE:\s*"false"/);
assert.match(compose, /sonar-private:\n\s+internal:\s+true/);
assert.match(compose, /ipv4_address:\s*172\.30\.250\.10/);
assert.doesNotMatch(compose, /^\s+ports:/m);
assert.match(compose, /^  database:\n[\s\S]*?image: postgres:/m);
assert.match(compose, /sonar-database:\n\s+internal:\s+true/);
assert.match(compose, /sonarqube:[\s\S]*?sonar-database:\s*\{\}/);
assert.match(databaseSection ?? "", /networks:\s*\[sonar-database\]/);
assert.doesNotMatch(databaseSection ?? "", /sonar-private/);
assert.equal(
  properties.match(/^sonar\.sources=(.*)$/m)?.[1],
  "apps/api/src,apps/web/src",
);
assert.equal(
  properties.match(/^sonar\.javascript\.lcov\.reportPaths=(.*)$/m)?.[1],
  "apps/api/coverage/lcov.info,apps/web/coverage/lcov.info",
);
assert.match(analysisScript, /sonar\.qualitygate\.wait=true/);
assert.match(analysisScript, /sonar\.qualitygate\.timeout=300/);
assert.match(analysisScript, /^set -Eeuo pipefail$/m);
assert.match(analysisScript, /umask 077/);
assert.match(analysisScript, /SONAR_ENV_FILE=\.secrets\/sonarqube_settings/);
assert.match(analysisScript, /SONAR_TOKEN_FILE=\.secrets\/sonarqube_token/);
assert.match(analysisScript, /grep -Eq '\^SONAR_TOKEN=\[\^\[:space:\]#\].\*'/);
assert.match(analysisScript, /-f "\$required_file" \|\| -L "\$required_file"/);
assert.match(analysisScript, /8#\$file_mode & 077/);
assert.match(analysisScript, /SONAR_NETWORK=grumphya-sonarqube_sonar-private/);
assert.match(analysisScript, /REFERENCE_SHA=\$\{SONAR_REFERENCE_SHA:-\}/);
assert.match(
  analysisScript,
  /GIT_REFERENCE_REF="refs\/heads\/sonar-main-base-/,
);
assert.match(analysisScript, /git bundle create .*"\$GIT_REFERENCE_REF" HEAD/);
assert.match(analysisScript, /update-ref refs\/heads\/main "\$REFERENCE_SHA"/);
assert.match(
  analysisScript,
  /env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE\s+\\?\s*git -C "\$GIT_METADATA_DIRECTORY\/checkout" update-ref/,
);
assert.match(analysisScript, /git rev-parse HEAD\)" != "\$ANALYSIS_SHA"/);
assert.match(analysisScript, /--network "\$SONAR_NETWORK"/);
assert.match(analysisScript, /--env-file "\$SONAR_TOKEN_FILE"/);
for (const mount of [
  "apps/api/src:/usr/src/apps/api/src:ro",
  "apps/api/coverage/lcov.info:/usr/src/apps/api/coverage/lcov.info:ro",
  "apps/api/tsconfig.json:/usr/src/apps/api/tsconfig.json:ro",
  "apps/web/src:/usr/src/apps/web/src:ro",
  "apps/web/coverage/lcov.info:/usr/src/apps/web/coverage/lcov.info:ro",
  "apps/web/tsconfig.json:/usr/src/apps/web/tsconfig.json:ro",
]) {
  assert.ok(
    analysisScript.includes(mount),
    `missing read-only scanner mount: ${mount}`,
  );
}
assert.match(analysisScript, /checkout\/\.git:\/usr\/src\/\.git:ro/);
assert.match(analysisScript, /sonar\.scm\.revision=/);
assert.doesNotMatch(analysisScript, /sonar\.scm\.disabled=true/);
assert.doesNotMatch(analysisScript, /\$ROOT\/apps:/);
const apiCoverageCheck = analysisScript.indexOf(
  "test -s apps/api/coverage/lcov.info",
);
const webCoverageCheck = analysisScript.indexOf(
  "test -s apps/web/coverage/lcov.info",
);
const scannerInvocation = analysisScript.indexOf('\"$SONAR_SCANNER_IMAGE\"');
assert.ok(apiCoverageCheck >= 0, "missing API coverage must block analysis");
assert.ok(webCoverageCheck >= 0, "missing web coverage must block analysis");
assert.ok(
  apiCoverageCheck < scannerInvocation && webCoverageCheck < scannerInvocation,
  "both coverage reports must be checked before the scanner runs",
);
assert.match(analysisScript, /trap cleanup EXIT/);
assert.doesNotMatch(
  analysisScript.slice(scannerInvocation),
  /\|\|\s*(?:true|:)/,
  "scanner or Quality Gate failures must propagate to the caller",
);
assert.match(pushHook, /remote_ref" = "refs\/heads\/main"/);
assert.match(pushHook, /git cat-file -e "\$main_remote_sha\^\{commit\}"/);
assert.match(
  pushHook,
  /git merge-base --is-ancestor "\$main_remote_sha" "\$main_push_sha"/,
);
assert.match(pushHook, /git status --porcelain/);
assert.match(pushHook, /main_push_sha" != "\$head_sha/);
assert.match(pushHook, /git rev-parse HEAD\)" != "\$head_sha"/);
assert.match(
  pushHook,
  /SONAR_REFERENCE_SHA=\$main_remote_sha pnpm sonar:verify/,
);
assert.equal(
  packageJson.scripts.prepare,
  "husky",
  "pnpm install must install Husky hooks in every checkout",
);
assert.match(pushHook, /pnpm sonar:verify/);
assert.doesNotMatch(
  analysisScript,
  /SonarSource\/sonarqube-scan-action|github\.com\/|sonarcloud\.io/,
);
assert.doesNotMatch(
  workflow,
  /sonar-analysis|SONAR_TOKEN|run_sonar_verification/,
);
process.stdout.write("SonarQube private-local policy checks passed.\n");
