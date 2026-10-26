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
  "vars.PRODUCTION_DEPLOY_ENABLED == 'true'",
];
const EXPECTED_DEPLOY_CONDITION = REQUIRED_DEPLOY_GUARDS.join(" && ");
const REQUIRED_IMAGE_SCANS = [
  "Scan API image",
  "Scan web image",
  "Scan PostgreSQL image",
  "Scan Caddy image",
];
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
const deploymentStepStart = workflow.indexOf(
  "      - name: Deploy and verify, rolling back on failed public health checks",
  releaseJobStart,
);
assert.notEqual(deploymentStepStart, -1, "production deploy step must exist");
const deploymentStepEnd = workflow.indexOf(
  "      - name:",
  deploymentStepStart + 1,
);
const deploymentStep = workflow.slice(
  deploymentStepStart,
  deploymentStepEnd === -1 ? undefined : deploymentStepEnd,
);
const artifactStepStart = workflow.indexOf(
  "      - name: Keep the successfully deployed release artifact",
  deploymentStepStart,
);
assert.ok(
  artifactStepStart > deploymentStepStart,
  "artifact upload must follow deployment",
);
assert.equal(
  deploymentStepEnd,
  artifactStepStart,
  "artifact upload must be the next step after deployment and verification",
);
const artifactStep = workflow.slice(artifactStepStart);

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
for (const jobName of ["quality-and-e2e", "supply-chain"]) {
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

assert.match(releaseJob, /needs:\s*quality-and-e2e/);
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

for (const scan of REQUIRED_IMAGE_SCANS) {
  assert.ok(workflow.includes(scan), `missing production image scan: ${scan}`);
}

const shaTag = "${{ github.sha }}";
for (const [scanName, imageName] of [
  ["Scan API image", "grumphya-api"],
  ["Scan web image", "grumphya-web"],
  ["Scan PostgreSQL image", "grumphya-database"],
  ["Scan Caddy image", "grumphya-proxy"],
]) {
  const scanStart = workflow.indexOf(`- name: ${scanName}`);
  const nextStep = workflow.indexOf("      - name:", scanStart + 1);
  const scanStep = workflow.slice(
    scanStart,
    nextStep === -1 ? undefined : nextStep,
  );
  assert.ok(scanStart >= 0, `missing scan step: ${scanName}`);
  assert.ok(
    scanStep.includes(`image-ref: ${imageName}:${shaTag}`),
    `${scanName} must scan the image tagged with this commit SHA`,
  );
}

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
assert.match(artifactStep, /success\(\)/);
assert.match(artifactStep, /retention-days:\s*3/);
assert.ok(
  artifactStep.includes(`name: production-release-${shaTag}`),
  "the archived artifact must identify the deployed commit SHA",
);
assert.ok(
  artifactStep.includes("path: release-bundle.tar.gz"),
  "the archived artifact must be the release bundle that was deployed",
);
assert.doesNotMatch(
  artifactStep,
  /always\(\)|failure\(\)/,
  "an artifact must not upload after a failed deployment",
);

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

const artifactConditionBlock = artifactStep.match(
  /if:\s*>-\s*([\s\S]*?)\n\s*uses:/,
)?.[1];
assert.equal(
  artifactConditionBlock?.replace(/\s+/g, " ").trim(),
  [
    "success()",
    "github.event_name == 'workflow_dispatch'",
    "github.actor == 'fernandezpastoreduardo'",
    "github.triggering_actor == 'fernandezpastoreduardo'",
    "github.ref == 'refs/heads/main'",
    "inputs.approve_production_deploy == true",
    "vars.PRODUCTION_DEPLOY_ENABLED == 'true'",
  ].join(" && "),
  "release archive must require successful prior steps and the production deployment context",
);

console.log("Deployment policy guards are present.");
