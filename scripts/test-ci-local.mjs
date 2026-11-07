import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CI_LOCAL_SCRIPT = "scripts/ci-local.sh";
const CI_VERIFY_SCRIPT = "scripts/ci-verify.sh";
const PACKAGE_PATH = "package.json";
const NODE_VERSION_PATH = ".node-version";
const NVMRC_PATH = ".nvmrc";
const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const CI_RUNNER_DOCKERFILE_PATH = "docker/ci-runner.Dockerfile";
const INVALID_MODE = "not-a-ci-mode";
const EXPECTED_USAGE_EXIT_CODE = 2;
const ARTIFACTS_OUTPUT_PATTERN = /Logs and Playwright artifacts: (\S+)/;

const [
  packageContent,
  nodeVersionContent,
  nvmrcContent,
  workflow,
  runnerDockerfile,
  lockfile,
] = await Promise.all([
  readFile(PACKAGE_PATH, "utf8"),
  readFile(NODE_VERSION_PATH, "utf8"),
  readFile(NVMRC_PATH, "utf8"),
  readFile(CI_WORKFLOW_PATH, "utf8"),
  readFile(CI_RUNNER_DOCKERFILE_PATH, "utf8"),
  readFile("pnpm-lock.yaml", "utf8"),
]);
const packageManifest = JSON.parse(packageContent);
const nodeVersion = nodeVersionContent.trim();
const pnpmVersion = packageManifest.packageManager.replace(/^pnpm@/, "");
const webImporterStart = lockfile.indexOf("  apps/web:\n");
const webImporterEnd = lockfile.indexOf("\n  apps/api:", webImporterStart);
const webImporter = lockfile.slice(webImporterStart, webImporterEnd);
const playwrightVersion = webImporter.match(
  /^      '@playwright\/test':\n        specifier: [^\n]+\n        version: (\d+\.\d+\.\d+)/m,
)?.[1];
assert.ok(
  playwrightVersion,
  "lockfile must pin @playwright/test for the web app",
);

assert.equal(nvmrcContent.trim(), nodeVersion);
assert.equal(packageManifest.engines.node, `^${nodeVersion}`);
assert.match(runnerDockerfile, new RegExp(`ARG NODE_VERSION=${nodeVersion}`));
assert.match(runnerDockerfile, new RegExp(`ARG PNPM_VERSION=${pnpmVersion}`));
assert.match(
  workflow,
  new RegExp(`version: ${pnpmVersion.replaceAll(".", "\\.")}`),
);
assert.match(workflow, /run: pnpm ci:verify quality/);
assert.match(workflow, /run: pnpm ci:verify e2e/);
assert.match(workflow, /run: pnpm ci:verify audit/);
assert.match(
  workflow,
  new RegExp(
    `image: mcr\\.microsoft\\.com/playwright:v${playwrightVersion}-noble`,
  ),
);
assert.match(
  runnerDockerfile,
  new RegExp(
    `ARG PLAYWRIGHT_VERSION=${playwrightVersion.replaceAll(".", "\\.")}`,
  ),
);
assert.equal(packageManifest.scripts["ci:verify"], "bash scripts/ci-verify.sh");

function runBashScript(scriptPath, arguments_, environment = process.env) {
  return spawnSync("/bin/bash", [scriptPath, ...arguments_], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
  });
}

function makeExecutable(contents) {
  return `#!/bin/bash\nset -euo pipefail\n${contents}\n`;
}

async function writeMockCommand(directory, commandName, contents) {
  const commandPath = join(directory, commandName);
  await writeFile(commandPath, makeExecutable(contents), { mode: 0o755 });
  return commandPath;
}

const invalidCiLocalMode = runBashScript(CI_LOCAL_SCRIPT, [INVALID_MODE]);
assert.equal(invalidCiLocalMode.status, EXPECTED_USAGE_EXIT_CODE);
assert.match(invalidCiLocalMode.stderr, /Usage:.*\[all\|quality\|e2e\|audit\]/);

const invalidCiVerifyMode = runBashScript(CI_VERIFY_SCRIPT, [INVALID_MODE]);
assert.equal(invalidCiVerifyMode.status, EXPECTED_USAGE_EXIT_CODE);
assert.match(invalidCiVerifyMode.stderr, /Usage:.*<quality\|e2e\|audit>/);

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "grumphya-ci-local-test-"),
);
const mockBinDirectory = join(temporaryDirectory, "bin");
const mockLogPath = join(temporaryDirectory, "commands.log");
const artifactsDirectories = [];

try {
  await mkdir(mockBinDirectory);
  await writeMockCommand(
    mockBinDirectory,
    "pnpm",
    'printf "pnpm %s%s\\n" "${NODE_OPTIONS:+NODE_OPTIONS=$NODE_OPTIONS }" "$*" >> "$CI_LOCAL_TEST_LOG"',
  );
  const auditEnvironment = {
    ...process.env,
    CI_LOCAL_TEST_LOG: mockLogPath,
    CI_LOCAL_TEST_REAL_NODE: process.execPath,
    PATH: `${mockBinDirectory}:${process.env.PATH}`,
  };
  const auditRun = runBashScript(CI_VERIFY_SCRIPT, ["audit"], auditEnvironment);
  assert.equal(auditRun.status, 0, auditRun.stderr);

  const auditCommands = await readFile(mockLogPath, "utf8");
  assert.deepEqual(auditCommands.trim().split("\n"), [
    "pnpm audit --audit-level moderate",
    "pnpm audit --prod --audit-level high",
  ]);

  await rm(mockLogPath, { force: true });
  await writeMockCommand(
    mockBinDirectory,
    "node",
    [
      'if [[ "${1:-}" == -p ]]; then exec "$CI_LOCAL_TEST_REAL_NODE" "$@"; fi',
      'printf "node %s\\n" "$*" >> "$CI_LOCAL_TEST_LOG"',
    ].join("\n"),
  );
  await writeMockCommand(
    mockBinDirectory,
    "bash",
    'printf "bash %s\\n" "$*" >> "$CI_LOCAL_TEST_LOG"',
  );
  const qualityRun = runBashScript(
    CI_VERIFY_SCRIPT,
    ["quality"],
    auditEnvironment,
  );
  assert.equal(qualityRun.status, 0, qualityRun.stderr);

  const qualityCommands = await readFile(mockLogPath, "utf8");
  assert.deepEqual(qualityCommands.trim().split("\n"), [
    "pnpm --filter @grumphya/api exec tsx scripts/prepare-test-database.ts",
    "pnpm NODE_OPTIONS=--no-experimental-webstorage quality:check",
    "node scripts/test-deploy-policy.mjs",
    "node scripts/test-sonarqube-config.mjs",
    "node scripts/test-pre-push-hook.mjs",
    "bash -n docker/vps-deploy.sh scripts/test-vps-deploy.sh",
    "bash scripts/test-vps-deploy.sh",
  ]);

  await rm(mockLogPath, { force: true });
  await writeMockCommand(
    mockBinDirectory,
    "docker",
    [
      'printf "docker %s\\n" "$*" >> "$CI_LOCAL_TEST_LOG"',
      'case "${1:-}" in',
      '  build) printf "mock image build\\n" ;;',
      '  run) if [[ "${CI_LOCAL_TEST_FAIL_RUN:-0}" == 1 && "$*" == *"runner e2e" ]]; then printf "mock runner failure\\n"; exit 17; fi; printf "mock container run\\n" ;;',
      '  inspect) printf "healthy\\n" ;;',
      "esac",
    ].join("\n"),
  );
  await writeMockCommand(
    mockBinDirectory,
    "rsync",
    [
      'printf "rsync %s\\n" "$*" >> "$CI_LOCAL_TEST_LOG"',
      'mkdir -p "${@: -1}"',
    ].join("\n"),
  );

  const localRun = runBashScript(CI_LOCAL_SCRIPT, ["e2e"], {
    ...auditEnvironment,
    TMPDIR: temporaryDirectory,
  });
  assert.equal(localRun.status, 0, localRun.stderr);
  const artifactsMatch = localRun.stdout.match(ARTIFACTS_OUTPUT_PATTERN);
  assert.ok(
    artifactsMatch,
    "successful local CI must report its retained artifacts",
  );
  artifactsDirectories.push(artifactsMatch[1]);

  const recordedCommands = await readFile(mockLogPath, "utf8");
  assert.match(
    recordedCommands,
    /rsync .*--exclude=\.env\*.*--exclude=\.secrets.*--exclude=\.aws/,
  );
  assert.match(
    recordedCommands,
    /docker build --progress plain --platform linux\/amd64/,
  );
  assert.match(recordedCommands, /--build-arg NODE_VERSION=26\.13\.0/);
  assert.match(recordedCommands, /--build-arg PNPM_VERSION=12\.5\.1/);
  assert.match(
    recordedCommands,
    new RegExp(
      `--build-arg PLAYWRIGHT_VERSION=${playwrightVersion.replaceAll(".", "\\.")}`,
    ),
  );
  assert.match(
    recordedCommands,
    /docker run --rm --platform linux\/amd64 --shm-size=1gb/,
  );
  assert.match(recordedCommands, /target=\/source,readonly/);
  assert.match(recordedCommands, /target=\/artifacts/);
  assert.match(recordedCommands, / grumphya-ci-local-[^ ]+-runner e2e/);
  await rm(mockLogPath, { force: true });
  const qualityLocalRun = runBashScript(CI_LOCAL_SCRIPT, ["quality"], {
    ...auditEnvironment,
    TMPDIR: temporaryDirectory,
  });
  assert.equal(qualityLocalRun.status, 0, qualityLocalRun.stderr);
  const qualityArtifactsMatch = qualityLocalRun.stdout.match(
    ARTIFACTS_OUTPUT_PATTERN,
  );
  assert.ok(
    qualityArtifactsMatch,
    "successful quality mode must report its retained artifacts",
  );
  artifactsDirectories.push(qualityArtifactsMatch[1]);
  const qualityLocalCommands = await readFile(mockLogPath, "utf8");
  assert.match(
    qualityLocalCommands,
    /docker network create grumphya-ci-local-/,
  );
  assert.match(
    qualityLocalCommands,
    /docker run --detach --platform linux\/amd64 --name grumphya-ci-local-[^ ]+-postgres/,
  );
  assert.match(qualityLocalCommands, /--network-alias postgres/);
  assert.match(
    qualityLocalCommands,
    /--health-cmd pg_isready -U grumphya_test -d grumphya_test/,
  );
  assert.match(
    qualityLocalCommands,
    /docker inspect --format \{\{\.State\.Health\.Status\}\}/,
  );
  assert.match(
    qualityLocalCommands,
    /docker run --rm --platform linux\/amd64 .*--network grumphya-ci-local-/,
  );
  assert.match(qualityLocalCommands, / grumphya-ci-local-[^ ]+-runner quality/);

  await rm(mockLogPath, { force: true });
  const failedLocalRun = runBashScript(CI_LOCAL_SCRIPT, ["e2e"], {
    ...auditEnvironment,
    CI_LOCAL_TEST_FAIL_RUN: "1",
    TMPDIR: temporaryDirectory,
  });
  assert.equal(failedLocalRun.status, 17);
  const failureOutput = `${failedLocalRun.stdout}\n${failedLocalRun.stderr}`;
  assert.match(failureOutput, /CI-equivalent checks failed \(exit 17\)/);
  const failedArtifactsMatch = failureOutput.match(ARTIFACTS_OUTPUT_PATTERN);
  assert.ok(
    failedArtifactsMatch,
    "failed local CI must retain and report its artifact directory",
  );
  artifactsDirectories.push(failedArtifactsMatch[1]);
  const failureCommands = await readFile(mockLogPath, "utf8");
  assert.match(failureCommands, /docker rm -f grumphya-ci-local-/);
  assert.match(failureCommands, /docker network rm grumphya-ci-local-/);
  assert.match(
    failureCommands,
    /docker image rm grumphya-ci-local-[^ ]+-runner/,
  );
} finally {
  await Promise.all(
    artifactsDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  await rm(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write("Local CI runner checks passed.\n");
