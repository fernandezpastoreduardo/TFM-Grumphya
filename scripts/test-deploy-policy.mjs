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
const REQUIRED_IMAGE_SCANS = ["Scan production images sequentially"];
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
  "      - name: Preflight production deployment",
  releaseJobStart,
);
assert.notEqual(
  deploymentStepStart,
  -1,
  "production preflight step must exist",
);
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
  /BUILDX_BUILDER: \$\{\{ steps\.buildx\.outputs\.name \}\}[\s\S]*?docker compose --parallel 4[\s\S]*?--file compose\.production\.yaml[\s\S]*?build --pull api web db proxy/,
  "production images must use the configured Buildx builder through Compose",
);
assert.match(
  releaseJob,
  /docker\/setup-buildx-action@37fe631027851001ddb9b187196cc803df7f5f0e # v4\.3\.0/,
  "production builds must use the pinned Buildx setup action",
);
assert.match(
  releaseJob,
  /crazy-max\/ghaction-github-runtime@04d248b84655b509d8c44dc1d6f990c879747487 # v4\.0\.0/,
  "BuildKit must receive the GitHub Actions cache runtime",
);
assert.match(
  releaseJob,
  /services:\s*\n\s+proxy:\s*\n\s+build:\s*\n\s+cache_from:[\s\S]*?type=gha,scope=grumphya-caddy[\s\S]*?cache_to:[\s\S]*?type=gha,scope=grumphya-caddy,mode=max,ignore-error=true/,
  "only the slow Caddy build should use a non-blocking persistent BuildKit cache",
);
assert.match(
  releaseJob,
  /--file compose\.production\.yaml[\s\S]*?--file "\$RUNNER_TEMP\/compose\.build-cache\.yaml"/,
  "the BuildKit cache must be applied as a CI-only Compose override",
);
assert.match(
  releaseJob,
  /name: Clear temporary BuildKit cache credentials\n\s+if: always\(\)[\s\S]*?ACTIONS_RUNTIME_TOKEN=/,
  "BuildKit cache credentials must be cleared before later supply-chain steps",
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
  assert.match(scanStep, /--skip-version-check/);
  assert.match(scanStep, /--disable-telemetry/);
  assert.match(scanStep, /--cache-dir "\$RUNNER_TEMP\/trivy-db"/);
  assert.doesNotMatch(scanStep, /cp -R|pids=\(\)|wait_for_scan_batch/);
  assert.match(
    scanStep,
    /for image in "\$API_IMAGE" "\$WEB_IMAGE" "\$DATABASE_IMAGE" "\$PROXY_IMAGE"; do[\s\S]*?done/,
    "all four production images must be included in the scan loop",
  );
  assert.doesNotMatch(
    scanStep,
    /trivy image[^\n]*&\s*$/m,
    "Trivy scans must run in the foreground to avoid overlapping image extraction",
  );
  assert.doesNotMatch(
    scanStep,
    /java-db|--download-java-db-only/,
    "production images do not need Trivy's Java index database",
  );
  assert.match(
    scanStep,
    /scan_status=0\s+for image in[\s\S]*?if TRIVY_SKIP_DB_UPDATE=true[\s\S]*?"\$image" > "\$scan_dir\/\$name\.log" 2>&1; then\s+(:|true)\s+else\s+scan_status=1\s+fi/,
    "exit 0 must leave the initialized status unchanged, and any failed Trivy scan must set it to 1",
  );
  assert.match(
    scanStep,
    /done\s+for image in "\$API_IMAGE"[\s\S]*?cat "\$scan_dir\/\$\{image%%:\*\}\.log"[\s\S]*?exit "\$scan_status"/,
    "every image report must be printed and any failed scan must fail the step",
  );
}
assert.match(
  workflow,
  /aquasecurity\/setup-trivy@e07451d2e059ed86c2870430ea286b3a9e0bf241 # v0\.2\.6/,
  "Trivy must be installed from a pinned action revision",
);
assert.match(
  workflow,
  /Build images while downloading the Trivy vulnerability database[\s\S]*?BUILDX_BUILDER: \$\{\{ steps\.buildx\.outputs\.name \}\}[\s\S]*?trivy --cache-dir "\$RUNNER_TEMP\/trivy-db" image --download-db-only[\s\S]*?2>&1 &\n[\s\S]*?docker compose --parallel 4[\s\S]*?build --pull api web db proxy/,
  "Docker image builds and vulnerability database download must overlap",
);
const trivyDatabaseDownloadStart = workflow.indexOf(
  "- name: Build images while downloading the Trivy vulnerability database",
);
const imageScanStart = workflow.indexOf(
  "- name: Scan production images sequentially",
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

const saveImagesStart = workflow.indexOf("- name: Save scanned release images");
const assembleBundleStart = workflow.indexOf(
  "- name: Assemble production release bundle",
);
const preflightStart = workflow.indexOf(
  "- name: Preflight production deployment",
);
assert.ok(saveImagesStart >= 0, "release image save step must exist");
assert.ok(
  assembleBundleStart > saveImagesStart,
  "bundle assembly must follow image saving",
);
assert.ok(
  preflightStart > assembleBundleStart,
  "deployment preflight must follow bundle assembly",
);
const saveImagesStep = workflow.slice(saveImagesStart, assembleBundleStart);
const assembleBundleStep = workflow.slice(assembleBundleStart, preflightStart);
for (const imageName of [
  "grumphya-api",
  "grumphya-web",
  "grumphya-database",
  "grumphya-proxy",
]) {
  assert.ok(
    saveImagesStep.includes(`${imageName}:${shaTag}`),
    `release image archive must contain the scanned ${imageName} image for this SHA`,
  );
}
assert.ok(
  assembleBundleStep.includes(`DEPLOY_SHA=${shaTag}`),
  "release metadata must be bound to the same commit SHA as scanned images",
);
for (const [stepName, step] of [
  ["image save", saveImagesStep],
  ["bundle assembly", assembleBundleStep],
]) {
  for (const guard of REQUIRED_DEPLOY_GUARDS) {
    assert.ok(
      step.includes(guard),
      `${stepName} step missing deploy guard: ${guard}`,
    );
  }
}
const deploymentExecutionStepStart = workflow.indexOf(
  "      - name: Deploy and verify, rolling back on failed public health checks",
  deploymentStepStart,
);
const deploymentExecutionStep = workflow.slice(
  deploymentExecutionStepStart,
  deploymentStepEnd === -1 ? undefined : deploymentStepEnd,
);
const executionConditionBlock = deploymentExecutionStep.match(
  /if:\s*>-\s*([\s\S]*?)\n\s*env:/,
)?.[1];
assert.equal(
  executionConditionBlock?.replace(/\s+/g, " ").trim(),
  EXPECTED_DEPLOY_CONDITION,
  "the deployment step must retain every safety gate after preflight",
);
const deploymentPreflightStep = deploymentStep.slice(
  0,
  deploymentExecutionStepStart - deploymentStepStart,
);
assert.match(
  deploymentPreflightStep,
  /id: production-preflight[\s\S]*?preflight \$GITHUB_SHA \$release_bytes/,
  "the preflight step must check VPS capacity before release transfer",
);
assert.match(
  deploymentPreflightStep,
  /echo "release_bytes=\$release_bytes"[\s\S]*?echo "release_sha256=\$release_sha256"[\s\S]*?echo "previous_sha=\$previous_sha"[\s\S]*?>> "\$GITHUB_OUTPUT"/,
  "preflight must pass the measured bundle metadata and rollback revision to deployment",
);
assert.match(
  deploymentExecutionStep,
  /RELEASE_BYTES: \$\{\{ steps\.production-preflight\.outputs\.release_bytes \}\}[\s\S]*?RELEASE_SHA256: \$\{\{ steps\.production-preflight\.outputs\.release_sha256 \}\}[\s\S]*?PREVIOUS_RELEASE_SHA: \$\{\{ steps\.production-preflight\.outputs\.previous_sha \}\}/,
  "deployment must consume the values validated during preflight",
);
assert.match(
  deploymentExecutionStep,
  /\[\[ "\$release_bytes" == "\$RELEASE_BYTES" && "\$release_sha256" == "\$RELEASE_SHA256" \]\]/,
  "deployment must revalidate bundle size and hash after preflight",
);
for (const guard of REQUIRED_DEPLOY_GUARDS) {
  assert.ok(
    deploymentStep.includes(guard),
    `preflight or deployment step missing deploy guard: ${guard}`,
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
