import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const WORKFLOW_PATH = ".github/workflows/ci.yml";
const REQUIRED_DEPLOY_GUARDS = [
  "success()",
  "github.event_name == 'workflow_dispatch'",
  "github.actor == 'fernandezpastoreduardo'",
  "github.triggering_actor == 'fernandezpastoreduardo'",
  "github.ref == 'refs/heads/main'",
  "inputs.approve_production_deploy == true",
  "needs.quality-and-e2e.result == 'success'",
  "needs.e2e.result == 'success'",
  "needs.dependency-audit.result == 'success'",
  "vars.PRODUCTION_DEPLOY_ENABLED == 'true'",
];
const EXPECTED_DEPLOY_CONDITION = REQUIRED_DEPLOY_GUARDS.join(" && ");
const REQUIRED_IMAGE_SCANS = ["Scan all production images concurrently"];
const DEPLOY_ONLY_SECRETS = [
  "secrets.PRODUCTION_SSH_HOST",
  "secrets.PRODUCTION_SSH_USER",
  "secrets.PRODUCTION_SSH_PRIVATE_KEY",
  "secrets.PRODUCTION_SSH_KNOWN_HOSTS",
];

const workflow = await readFile(WORKFLOW_PATH, "utf8");
const releaseJobStart = workflow.indexOf("  supply-chain:");
assert.notEqual(releaseJobStart, -1, "release job must exist");
const releaseJob = workflow.slice(releaseJobStart);
const beforeReleaseJob = workflow.slice(0, releaseJobStart);
const dependencyAuditStart = workflow.indexOf("  dependency-audit:");
assert.notEqual(dependencyAuditStart, -1, "early dependency audit must exist");
const dependencyAuditEnd = workflow.indexOf(
  "  supply-chain:",
  dependencyAuditStart,
);
const dependencyAuditJob = workflow.slice(
  dependencyAuditStart,
  dependencyAuditEnd,
);
assert.doesNotMatch(
  dependencyAuditJob,
  /^    needs:/m,
  "dependency auditing must start in parallel with quality and E2E",
);
assert.match(dependencyAuditJob, /pnpm audit --audit-level moderate/);
assert.match(dependencyAuditJob, /pnpm audit --prod --audit-level high/);
const deploymentStepStart = workflow.indexOf(
  "      - name: Deploy and verify, rolling back on failed public health checks",
  releaseJobStart,
);
assert.notEqual(deploymentStepStart, -1, "production deploy step must exist");
const deploymentStepEnd = workflow.indexOf(
  "\n  deploy-production:",
  deploymentStepStart,
);
const deploymentStep = workflow.slice(
  deploymentStepStart,
  deploymentStepEnd === -1 ? undefined : deploymentStepEnd,
);
assert.match(workflow, /cancel-in-progress:\s*false/);
assert.doesNotMatch(
  workflow,
  /^  push\s*:/m,
  "a push to main must not trigger the workflow automatically",
);
assert.match(workflow, /workflow_dispatch:[\s\S]*?approve_production_deploy:/);
assert.match(workflow, /approve_production_deploy:[\s\S]*?type:\s*boolean/);
assert.match(workflow, /approve_production_deploy:[\s\S]*?default:\s*false/);

const expectedManualActorGate =
  "github.event_name != 'workflow_dispatch' || (github.actor == 'fernandezpastoreduardo' && github.triggering_actor == 'fernandezpastoreduardo')";
for (const jobName of [
  "quality-and-e2e",
  "e2e",
  "dependency-audit",
  "supply-chain",
]) {
  const jobStart = workflow.indexOf(`  ${jobName}:`);
  const nextJobMatch = workflow
    .slice(jobStart + 1)
    .match(/^  [a-z][\w-]*:\s*$/m);
  const nextJobStart = nextJobMatch ? jobStart + 1 + nextJobMatch.index : -1;
  const job = workflow.slice(
    jobStart,
    nextJobStart === -1 ? undefined : nextJobStart,
  );
  const actorGate = job.match(/^    if:\s*>-\s*\n((?:      .*\n)+)/m)?.[1];
  assert.equal(
    actorGate?.replace(/\s+/g, " ").trim(),
    expectedManualActorGate,
    `${jobName} must reject unauthorized manual dispatches and reruns`,
  );
}

assert.match(releaseJob, /needs:\s*\[quality-and-e2e, e2e, dependency-audit\]/);
assert.match(
  releaseJob,
  /docker compose --parallel 4 --file compose\.production\.yaml build --pull api web db proxy/,
  "production images must build concurrently through Compose",
);
assert.doesNotMatch(
  workflow,
  /actions\/upload-artifact@/,
  "production releases must not consume the repository artifact quota",
);
assert.match(
  workflow,
  /container:\s*\n\s+image:\s*mcr\.microsoft\.com\/playwright:v1\.64\.0-noble/,
);
const conditionBlock = deploymentStep.match(
  /if:\s*>-\s*([\s\S]*?)\n\s*env:/,
)?.[1];
assert.equal(
  conditionBlock?.replace(/\s+/g, " ").trim(),
  EXPECTED_DEPLOY_CONDITION,
  "deployment must require every safety gate together",
);
assert.doesNotMatch(
  beforeReleaseJob,
  /\bssh\s|PRODUCTION_SSH_(?:HOST|USER|PRIVATE_KEY|KNOWN_HOSTS)/,
  "quality checks must not receive or use SSH credentials",
);

const deploymentContexts = [
  {
    name: "automatic push to main",
    event: "push",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "pull request",
    event: "pull_request",
    ref: "refs/pull/17/merge",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "manual run from a feature branch",
    event: "workflow_dispatch",
    ref: "refs/heads/feature/example",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "failed quality job",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "failure",
    enabled: "true",
    expected: false,
  },
  {
    name: "failed browser end-to-end job",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    e2e: "failure",
    enabled: "true",
    expected: false,
  },
  {
    name: "failed dependency audit",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    e2e: "success",
    audit: "failure",
    enabled: "true",
    expected: false,
  },
  {
    name: "manual run by another account",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "another-account",
    triggeringActor: "another-account",
    approve: true,
    quality: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "manual rerun by another account",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "another-account",
    approve: true,
    quality: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "manual run without production approval",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: false,
    quality: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "production deployment disabled",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    enabled: "false",
    expected: false,
  },
  {
    name: "successful manually approved main release",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    enabled: "true",
    expected: true,
  },
];
for (const context of deploymentContexts) {
  const allowed =
    deploymentStep.includes("github.event_name == 'workflow_dispatch'") &&
    deploymentStep.includes("github.actor == 'fernandezpastoreduardo'") &&
    deploymentStep.includes(
      "github.triggering_actor == 'fernandezpastoreduardo'",
    ) &&
    deploymentStep.includes("github.ref == 'refs/heads/main'") &&
    deploymentStep.includes("inputs.approve_production_deploy == true") &&
    deploymentStep.includes("needs.quality-and-e2e.result == 'success'") &&
    deploymentStep.includes("vars.PRODUCTION_DEPLOY_ENABLED == 'true'") &&
    context.event === "workflow_dispatch" &&
    context.ref === "refs/heads/main" &&
    context.actor === "fernandezpastoreduardo" &&
    context.triggeringActor === "fernandezpastoreduardo" &&
    context.approve === true &&
    context.quality === "success" &&
    (context.e2e ?? "success") === "success" &&
    (context.audit ?? "success") === "success" &&
    deploymentStep.includes("needs.e2e.result == 'success'") &&
    context.enabled === "true";
  assert.equal(allowed, context.expected, `deploy gate: ${context.name}`);
}

for (const secret of DEPLOY_ONLY_SECRETS) {
  const firstReference = workflow.indexOf(secret);
  assert.ok(
    firstReference >= deploymentStepStart,
    `${secret} must be scoped to the deployment step`,
  );
}

const shaTag = "${{ github.sha }}";
for (const scanName of REQUIRED_IMAGE_SCANS) {
  const scanStart = workflow.indexOf(`- name: ${scanName}`);
  const nextStep = workflow.indexOf("      - name:", scanStart + 1);
  const scanStep = workflow.slice(
    scanStart,
    nextStep === -1 ? undefined : nextStep,
  );
  assert.ok(scanStart >= 0, `missing scan step: ${scanName}`);
  for (const [envName, imageName] of [
    ["API_IMAGE", "grumphya-api"],
    ["WEB_IMAGE", "grumphya-web"],
    ["DATABASE_IMAGE", "grumphya-database"],
    ["PROXY_IMAGE", "grumphya-proxy"],
  ]) {
    assert.ok(
      scanStep.includes(`${envName}: ${imageName}:${shaTag}`),
      `${scanName} must scan ${imageName} tagged with this commit SHA`,
    );
  }
  assert.match(scanStep, /TRIVY_SKIP_DB_UPDATE=true/);
  assert.match(scanStep, /TRIVY_SKIP_JAVA_DB_UPDATE=true/);
  assert.match(scanStep, /--scanners vuln/);
  assert.match(scanStep, /--severity HIGH,CRITICAL/);
  assert.match(scanStep, /--ignore-unfixed/);
  assert.match(scanStep, /--exit-code 1/);
  assert.match(scanStep, /--cache-dir "\$scan_dir\/\$name-cache"/);
  assert.match(scanStep, /cp -R "\$RUNNER_TEMP\/trivy-db\/db"/);
  assert.doesNotMatch(
    scanStep,
    /java-db|--download-java-db-only/,
    "production images do not need Trivy's Java index database",
  );
  assert.match(scanStep, /&\s*$/m);
  assert.match(scanStep, /wait "\$pid" \|\| scan_status=1/);
}
assert.match(
  workflow,
  /aquasecurity\/setup-trivy@e07451d2e059ed86c2870430ea286b3a9e0bf241 # v0\.2\.6/,
  "Trivy must be installed from a pinned action revision",
);
assert.match(
  workflow,
  /Build images while downloading the Trivy vulnerability database[\s\S]*?trivy --cache-dir "\$RUNNER_TEMP\/trivy-db" image --download-db-only[\s\S]*?2>&1 &\n[\s\S]*?docker compose --parallel 4 --file compose\.production\.yaml build --pull api web db proxy/,
  "Docker image builds and vulnerability database download must overlap",
);
const trivyDatabaseDownloadStart = workflow.indexOf(
  "- name: Build images while downloading the Trivy vulnerability database",
);
const imageScanStart = workflow.indexOf(
  "- name: Scan all production images concurrently",
);
const trivyDatabaseBuildStep = workflow.slice(
  trivyDatabaseDownloadStart,
  imageScanStart,
);
const databaseDownloadWait = trivyDatabaseBuildStep.indexOf(
  'if ! wait "$database_pid"; then',
);
assert.ok(databaseDownloadWait >= 0, "Trivy database download must be awaited");
assert.ok(
  databaseDownloadWait >
    trivyDatabaseBuildStep.indexOf("docker compose --parallel 4"),
  "the database download should overlap image builds",
);
assert.match(
  trivyDatabaseBuildStep.slice(databaseDownloadWait),
  /exit 1/,
  "a failed vulnerability database download must fail the supply-chain job",
);
assert.match(
  trivyDatabaseBuildStep,
  /if \(\( build_status != 0 \)\); then[\s\S]*?kill "\$database_pid"[\s\S]*?exit "\$build_status"/,
  "a failed image build must stop the concurrent database download and fail CI",
);
assert.doesNotMatch(
  workflow,
  /--download-java-db-only/,
  "production scans must not download the unnecessary Java index database",
);

const packageStart = workflow.indexOf(
  "- name: Package the already-scanned release images",
);
const packageEnd = workflow.indexOf("      - name:", packageStart + 1);
const packageStep = workflow.slice(
  packageStart,
  packageEnd === -1 ? undefined : packageEnd,
);
assert.ok(packageStart >= 0, "release package step must exist");
for (const imageName of [
  "grumphya-api",
  "grumphya-web",
  "grumphya-database",
  "grumphya-proxy",
]) {
  assert.ok(
    packageStep.includes(`${imageName}:${shaTag}`),
    `release bundle must contain the scanned ${imageName} image for this SHA`,
  );
}
assert.ok(
  packageStep.includes(`DEPLOY_SHA=${shaTag}`),
  "release metadata must be bound to the same commit SHA as scanned images",
);
for (const guard of REQUIRED_DEPLOY_GUARDS.filter(
  (guard) => !guard.startsWith("needs."),
)) {
  assert.ok(
    packageStep.includes(guard),
    `package step missing deploy guard: ${guard}`,
  );
}
assert.match(deploymentStep, /StrictHostKeyChecking=yes/);
assert.match(deploymentStep, /GlobalKnownHostsFile=\/dev\/null/);
assert.doesNotMatch(deploymentStep, /ssh-keyscan/);
assert.match(
  deploymentStep,
  /"deploy \$GITHUB_SHA \$release_bytes \$release_sha256"/,
);
assert.match(deploymentStep, /ssh .*"\$ssh_target" rollback/);
assert.match(
  deploymentStep,
  /curl --fail[^\n]*"https:\/\/\$PRODUCTION_DOMAIN\/api\/health"[^\n]*health\.json/,
  "deployment must fail on an unsuccessful public API health response",
);
assert.match(
  deploymentStep,
  /health\.revision !== process\.argv\[2\] \|\| health\.status !== "ok"/,
  "deployment health check must confirm the expected revision and healthy status",
);
assert.match(
  deploymentStep,
  /curl --fail[^\n]*"https:\/\/\$PRODUCTION_DOMAIN\/build\.json"[^\n]*web-build\.json/,
  "deployment must fail on an unsuccessful public build metadata response",
);
assert.match(
  deploymentStep,
  /build\.revision !== process\.argv\[2\]/,
  "deployment must confirm that the public web build serves the deployed revision",
);

console.log("Deployment policy guards are present.");
