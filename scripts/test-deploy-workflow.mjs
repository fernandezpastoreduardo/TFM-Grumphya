import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKFLOW_PATH = ".github/workflows/ci.yml";
const STEP_NAME =
  "      - name: Deploy and verify, rolling back on failed public health checks";
const OLD_SHA = "a".repeat(40);
const NEW_SHA = "b".repeat(40);
const workflow = await readFile(WORKFLOW_PATH, "utf8");
const stepStart = workflow.indexOf(STEP_NAME);
assert.notEqual(stepStart, -1, "the deployment step must exist");
const runStart = workflow.indexOf("        run: |\n", stepStart);
assert.notEqual(runStart, -1, "the deployment step must contain a Bash script");
const runLines = workflow
  .slice(runStart + "        run: |\n".length)
  .split("\n");
const scriptLines = [];
for (const line of runLines) {
  if (!line.startsWith("          ")) break;
  scriptLines.push(line.slice(10));
}
assert.ok(scriptLines.length > 0, "the deployment script must not be empty");
const deploymentScript = scriptLines.join("\n");

const tempRoot = await mkdtemp(join(tmpdir(), "grumphya-deploy-workflow-"));
const binDirectory = join(tempRoot, "bin");
const runnerTemp = join(tempRoot, "runner");
const statePath = join(tempRoot, "active-sha");
const logPath = join(tempRoot, "commands.log");
const bundle = "local test release bundle";
const bundleHash = createHash("sha256").update(bundle).digest("hex");

async function writeMock(name, lines) {
  await writeFile(
    join(binDirectory, name),
    `#!/bin/bash\nset -euo pipefail\n${lines.join("\n")}\n`,
    {
      mode: 0o755,
    },
  );
}

async function runScenario({
  name,
  previousSha,
  failAccount,
  expectedStatus,
  expectedCommands,
  expectedActiveSha,
  auditEnabled = false,
  auditStatus = 401,
}) {
  await writeFile(statePath, previousSha);
  await writeFile(logPath, "");
  const result = spawnSync("/bin/bash", ["-c", deploymentScript], {
    cwd: tempRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      RUNNER_TEMP: runnerTemp,
      PRODUCTION_SSH_HOST: "example.test",
      PRODUCTION_SSH_USER: "deploy",
      PRODUCTION_SSH_PRIVATE_KEY: "test-key",
      PRODUCTION_SSH_KNOWN_HOSTS: "test-host-key",
      PRODUCTION_DOMAIN: "example.test",
      RELEASE_BYTES: String(Buffer.byteLength(bundle)),
      RELEASE_SHA256: bundleHash,
      PREVIOUS_RELEASE_SHA: previousSha,
      AUDIT_ENABLED: auditEnabled ? "true" : "false",
      AUDIT_RELEASE_SIGNING_KEY: auditEnabled
        ? "synthetic-test-private-key"
        : "",
      GITHUB_SHA: NEW_SHA,
      MOCK_STATE: statePath,
      MOCK_LOG: logPath,
      MOCK_FAIL_ACCOUNT: failAccount ? "1" : "0",
      MOCK_AUDIT_STATUS: String(auditStatus),
    },
  });
  assert.equal(
    result.status === 0,
    expectedStatus === 0,
    `${name}: ${result.stderr}`,
  );
  const commands = (await readFile(logPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(commands, expectedCommands, name);
  assert.equal(await readFile(statePath, "utf8"), expectedActiveSha, name);
}

try {
  await mkdir(binDirectory);
  await mkdir(runnerTemp);
  await mkdir(join(tempRoot, "scripts"));
  await writeFile(
    join(tempRoot, "scripts/smoke-public-certification.sh"),
    "#!/bin/bash\nexit 0\n",
    {
      mode: 0o755,
    },
  );
  await writeFile(join(tempRoot, "release-bundle.tar.gz"), bundle);
  await writeMock("stat", ['printf "%s\\n" "$RELEASE_BYTES"']);
  await writeMock("sha256sum", ['printf "%s  %s\\n" "$RELEASE_SHA256" "$1"']);
  await writeMock("ssh", [
    'command="${!#}"',
    'case "$command" in',
    '  deploy*) printf "deploy\\n" >> "$MOCK_LOG"; printf "%s" "$GITHUB_SHA" > "$MOCK_STATE" ;;',
    '  provision-audit-signing-key) printf "provision-audit-signing-key\\n" >> "$MOCK_LOG" ;;',
    '  rollback) printf "rollback\\n" >> "$MOCK_LOG"; printf "%s" "$PREVIOUS_RELEASE_SHA" > "$MOCK_STATE" ;;',
    '  status) cat "$MOCK_STATE" ;;',
    "  *) exit 2 ;;",
    "esac",
  ]);
  await writeMock("curl", [
    'url="${!#}"',
    'active_sha=$(cat "$MOCK_STATE")',
    'if [[ "$url" == */audit/processors ]]; then printf "%s" "$MOCK_AUDIT_STATUS"; exit 0; fi',
    'if [[ "$url" == */account && "$MOCK_FAIL_ACCOUNT" == 1 && "$active_sha" == "$GITHUB_SHA" ]]; then exit 22; fi',
    'case "$url" in',
    '  */api/health) printf \'{"status":"ok","revision":"%s"}\\n\' "$active_sha" ;;',
    '  */build.json) printf \'{"revision":"%s"}\\n\' "$active_sha" ;;',
    '  *) printf "ok\\n" ;;',
    "esac",
  ]);

  await runScenario({
    name: "already active and healthy",
    previousSha: NEW_SHA,
    failAccount: false,
    expectedStatus: 0,
    expectedCommands: [],
    expectedActiveSha: NEW_SHA,
  });
  await runScenario({
    name: "already active with failed public check",
    previousSha: NEW_SHA,
    failAccount: true,
    expectedStatus: 1,
    expectedCommands: [],
    expectedActiveSha: NEW_SHA,
  });
  await runScenario({
    name: "new deployment and healthy public endpoints",
    previousSha: OLD_SHA,
    failAccount: false,
    expectedStatus: 0,
    expectedCommands: ["deploy"],
    expectedActiveSha: NEW_SHA,
  });
  await runScenario({
    name: "new deployment with failed public check",
    previousSha: OLD_SHA,
    failAccount: true,
    expectedStatus: 1,
    expectedCommands: ["deploy", "rollback"],
    expectedActiveSha: OLD_SHA,
  });
  await runScenario({
    name: "new audited deployment provisions the signer before smoke checks",
    previousSha: OLD_SHA,
    failAccount: false,
    expectedStatus: 0,
    expectedCommands: ["deploy", "provision-audit-signing-key"],
    expectedActiveSha: NEW_SHA,
    auditEnabled: true,
  });
  await runScenario({
    name: "audited endpoint rejects a runner outside its allowlisted network",
    previousSha: OLD_SHA,
    failAccount: false,
    expectedStatus: 0,
    expectedCommands: ["deploy", "provision-audit-signing-key"],
    expectedActiveSha: NEW_SHA,
    auditEnabled: true,
    auditStatus: 403,
  });
  await runScenario({
    name: "audited endpoint smoke rejects unexpected public responses",
    previousSha: OLD_SHA,
    failAccount: false,
    expectedStatus: 1,
    expectedCommands: ["deploy", "provision-audit-signing-key"],
    expectedActiveSha: NEW_SHA,
    auditEnabled: true,
    auditStatus: 404,
  });
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Deployment workflow branch scenarios passed.");
