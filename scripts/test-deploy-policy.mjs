import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const WORKFLOW_PATH = ".github/workflows/ci.yml";
const REQUIRED_DEPLOY_GUARDS = [
  "github.event_name == 'push'",
  "github.ref == 'refs/heads/main'",
  "needs.quality-and-e2e.result == 'success'",
  "needs.supply-chain.result == 'success'",
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
const deploymentStart = workflow.indexOf("  deploy-production:");
assert.notEqual(deploymentStart, -1, "production deploy job must exist");
const deploymentJob = workflow.slice(deploymentStart);
const beforeDeploymentJob = workflow.slice(0, deploymentStart);

assert.match(workflow, /cancel-in-progress:\s*false/);
assert.match(deploymentJob, /needs:\s*\[quality-and-e2e, supply-chain\]/);
for (const guard of REQUIRED_DEPLOY_GUARDS) {
  assert.ok(deploymentJob.includes(guard), `missing deploy guard: ${guard}`);
}

assert.match(deploymentJob, /if:\s*>-[\s\S]*?needs:/);
const conditionBlock = deploymentJob.match(
  /if:\s*>-\s*([\s\S]*?)\n\s*needs:/,
)?.[1];
assert.equal(
  conditionBlock?.replace(/\s+/g, " ").trim(),
  EXPECTED_DEPLOY_CONDITION,
  "the deployment job must require every safety gate together",
);
assert.doesNotMatch(
  beforeDeploymentJob,
  /\bssh\s|PRODUCTION_SSH_(?:HOST|USER|PRIVATE_KEY|KNOWN_HOSTS)/,
  "pull requests and ordinary CI jobs must not receive or use SSH credentials",
);
const deploymentContexts = [
  {
    name: "pull request",
    event: "pull_request",
    ref: "refs/pull/17/merge",
    quality: "success",
    supplyChain: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "push from a feature branch",
    event: "push",
    ref: "refs/heads/feature/example",
    quality: "success",
    supplyChain: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "failed quality job",
    event: "push",
    ref: "refs/heads/main",
    quality: "failure",
    supplyChain: "success",
    enabled: "true",
    expected: false,
  },
  {
    name: "failed supply-chain job",
    event: "push",
    ref: "refs/heads/main",
    quality: "success",
    supplyChain: "failure",
    enabled: "true",
    expected: false,
  },
  {
    name: "production deployment disabled",
    event: "push",
    ref: "refs/heads/main",
    quality: "success",
    supplyChain: "success",
    enabled: "false",
    expected: false,
  },
  {
    name: "successful gated main push",
    event: "push",
    ref: "refs/heads/main",
    quality: "success",
    supplyChain: "success",
    enabled: "true",
    expected: true,
  },
];
for (const context of deploymentContexts) {
  const allowed =
    deploymentJob.includes("github.event_name == 'push'") &&
    deploymentJob.includes("github.ref == 'refs/heads/main'") &&
    deploymentJob.includes("needs.quality-and-e2e.result == 'success'") &&
    deploymentJob.includes("needs.supply-chain.result == 'success'") &&
    deploymentJob.includes("vars.PRODUCTION_DEPLOY_ENABLED == 'true'") &&
    context.event === "push" &&
    context.ref === "refs/heads/main" &&
    context.quality === "success" &&
    context.supplyChain === "success" &&
    context.enabled === "true";
  assert.equal(allowed, context.expected, `deploy gate: ${context.name}`);
}

for (const secret of DEPLOY_ONLY_SECRETS) {
  const firstReference = workflow.indexOf(secret);
  assert.ok(
    firstReference >= deploymentStart,
    `${secret} must be scoped to deploy job`,
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
assert.match(workflow, /retention-days:\s*7/);
assert.ok(
  beforeDeploymentJob.includes(`name: production-release-${shaTag}`) &&
    deploymentJob.includes(`name: production-release-${shaTag}`),
  "the deployed artifact must be selected by the commit SHA",
);

assert.match(workflow, /PRODUCTION_DEPLOY_ENABLED == 'true'/);
assert.match(deploymentJob, /StrictHostKeyChecking=yes/);
assert.match(deploymentJob, /GlobalKnownHostsFile=\/dev\/null/);
assert.doesNotMatch(deploymentJob, /ssh-keyscan/);
assert.match(
  deploymentJob,
  /"deploy \$GITHUB_SHA \$release_bytes \$release_sha256"/,
);
assert.match(deploymentJob, /ssh .*"\$ssh_target" rollback/);
assert.match(deploymentJob, /health\.revision !== process\.argv\[2\]/);
assert.match(deploymentJob, /build\.revision !== process\.argv\[2\]/);

console.log("Deployment policy guards are present.");
