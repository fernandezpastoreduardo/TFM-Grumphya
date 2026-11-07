import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const WORKFLOW_PATH = ".github/workflows/ci.yml";
const CI_VERIFY_PATH = "scripts/ci-verify.sh";
const PRODUCTION_COMPOSE_PATH = "compose.production.yaml";
const SONAR_COMPOSE_PATH = "compose.sonarqube.yaml";
const VPS_DEPLOY_HELPER_PATH = "docker/vps-deploy.sh";
const PRODUCTION_COMPOSE_SMOKE_PATH = "scripts/test-production-compose.sh";
const SONAR_CONFIG_PATH = "sonar-project.properties";
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
  "needs.sonar-analysis.result == 'success'",
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
const lockfile = await readFile("pnpm-lock.yaml", "utf8");
const ciVerify = await readFile(CI_VERIFY_PATH, "utf8");
const productionCompose = await readFile(PRODUCTION_COMPOSE_PATH, "utf8");
const sonarCompose = await readFile(SONAR_COMPOSE_PATH, "utf8");
const vpsDeployHelper = await readFile(VPS_DEPLOY_HELPER_PATH, "utf8");
const productionComposeSmoke = await readFile(
  PRODUCTION_COMPOSE_SMOKE_PATH,
  "utf8",
);
const sonarConfig = await readFile(SONAR_CONFIG_PATH, "utf8");
const sonarProperties = Object.fromEntries(
  sonarConfig
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
assert.equal(sonarProperties["sonar.projectKey"], "grumphya");
assert.equal(
  sonarProperties["sonar.sources"],
  "apps/api/src,apps/web/src",
  "SonarQube must analyze both application source trees",
);
assert.equal(
  sonarProperties["sonar.javascript.lcov.reportPaths"],
  "apps/api/coverage/lcov.info,apps/web/coverage/lcov.info",
  "SonarQube must consume coverage from both applications",
);
assert.doesNotMatch(
  sonarConfig,
  /^sonar\.(?:login|token|password)\s*=/m,
  "SonarQube credentials must not be committed to project configuration",
);
assert.match(
  sonarCompose,
  /sonarqube:\n[\s\S]*?image: sonarqube:[^\n]*community/,
);
assert.match(sonarCompose, /SONAR_TELEMETRY_ENABLE:\s*"false"/);
assert.match(sonarCompose, /SONAR_UPDATECENTER_ACTIVATE:\s*"false"/);
assert.match(sonarCompose, /ipv4_address:\s*172\.30\.250\.10/);
assert.match(sonarCompose, /subnet:\s*172\.30\.250\.0\/24/);
assert.doesNotMatch(
  sonarCompose,
  /^\s+ports:/m,
  "SonarQube must not publish a host port from its internal-only network",
);
assert.match(sonarCompose, /sonar-private:\n\s+internal:\s+true/);
const sonarDatabaseSection = sonarCompose.match(
  /^  database:\n([\s\S]*?)(?=^  sonarqube:)/m,
)?.[1];
assert.ok(sonarDatabaseSection, "SonarQube PostgreSQL service must exist");
assert.doesNotMatch(
  sonarDatabaseSection,
  /^\s+ports:/m,
  "SonarQube PostgreSQL must not publish a host port",
);
const secretFilePaths = productionCompose.matchAll(
  /^\s+file: \$\{GRUMPHYA_SECRETS_DIR:-\.\/\.secrets\}\//gm,
);
assert.equal(
  [...secretFilePaths].length,
  14,
  "all production secret mounts must use the configurable secret directory",
);
assert.match(
  vpsDeployHelper,
  /GRUMPHYA_SECRETS_DIR="\$SECRETS_DIR" docker compose/,
  "VPS Compose operations must resolve secret mounts from the persistent VPS directory",
);
assert.match(
  productionComposeSmoke,
  /GRUMPHYA_SECRETS_DIR=\$TEMP_ROOT\/\.secrets/,
  "the production Compose smoke must exercise the explicit secret directory",
);
const releaseJobStart = workflow.indexOf("  supply-chain:");
assert.notEqual(releaseJobStart, -1, "release job must exist");
const releaseJob = workflow.slice(releaseJobStart);
const beforeReleaseJob = workflow.slice(0, releaseJobStart);
const sonarJobStart = workflow.indexOf("  sonar-analysis:");
assert.notEqual(sonarJobStart, -1, "SonarQube analysis job must exist");
const sonarJobEnd = workflow.indexOf("\n  supply-chain:", sonarJobStart);
assert.ok(sonarJobEnd > sonarJobStart, "SonarQube must run before release");
const sonarJob = workflow.slice(sonarJobStart, sonarJobEnd);
const expectedSonarJobCondition = [
  "github.event_name == 'workflow_dispatch'",
  "github.actor == 'fernandezpastoreduardo'",
  "github.triggering_actor == 'fernandezpastoreduardo'",
  "github.ref == 'refs/heads/main'",
  "inputs.approve_production_deploy == true",
  "vars.PRODUCTION_DEPLOY_ENABLED == 'true'",
].join(" && ");
const sonarJobCondition = sonarJob.match(
  /^    if:\s*>-\s*\n((?:      .*\n)+)/m,
)?.[1];
assert.equal(
  sonarJobCondition?.replace(/\s+/g, " ").trim(),
  expectedSonarJobCondition,
  "only an approved main release should run private SonarQube analysis",
);
assert.match(sonarJob, /^    needs: quality-and-e2e$/m);
assert.match(
  sonarJob,
  /node scripts\/verify-sonarqube-gate\.mjs/,
  "SonarQube analysis must wait for the actual quality-gate result",
);
assert.doesNotMatch(
  sonarJob,
  /continue-on-error:\s*true|\|\|\s*true/,
  "SonarQube scanner or gate failures must not be ignored",
);
const dependencyAuditStart = workflow.indexOf("  dependency-audit:");
assert.notEqual(dependencyAuditStart, -1, "early dependency audit must exist");
const dependencyAuditEnd = workflow.indexOf(
  "  sonar-analysis:",
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
assert.match(dependencyAuditJob, /pnpm ci:verify audit/);
assert.match(ciVerify, /pnpm audit --audit-level moderate/);
assert.match(ciVerify, /pnpm audit --prod --audit-level high/);
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
for (const jobName of ["quality-and-e2e", "e2e", "dependency-audit"]) {
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
const supplyChainCondition = releaseJob.match(
  /^    if:\s*>-\s*\n((?:      .*\n)+)/m,
)?.[1];
const expectedSupplyChainCondition = [
  "always()",
  `(${expectedManualActorGate})`,
  "needs.quality-and-e2e.result == 'success'",
  "needs.e2e.result == 'success'",
  "needs.dependency-audit.result == 'success'",
  "(needs.sonar-analysis.result == 'success' || (needs.sonar-analysis.result == 'skipped' && (github.event_name != 'workflow_dispatch' || inputs.approve_production_deploy != true || github.ref != 'refs/heads/main' || vars.PRODUCTION_DEPLOY_ENABLED != 'true')))",
].join(" && ");
assert.equal(
  supplyChainCondition?.replace(/\s+/g, " ").trim(),
  expectedSupplyChainCondition,
  "an approved main release must not bypass a failed, unavailable, or skipped SonarQube job",
);

assert.match(
  releaseJob,
  /needs:\s*\[[^\]]*quality-and-e2e[^\]]*e2e[^\]]*dependency-audit[^\]]*sonar-analysis[^\]]*\]/,
  "release builds must depend on the completed SonarQube analysis",
);
assert.match(
  releaseJob,
  /BUILDX_BUILDER: \$\{\{ steps\.buildx\.outputs\.name \}\}[\s\S]*?docker compose --parallel 4[\s\S]*?--file compose\.production\.yaml[\s\S]*?build --pull api web db proxy/,
  "production images must use the configured Buildx builder through Compose",
);
assert.match(
  releaseJob,
  /docker\/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4\.4\.1/,
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
assert.match(
  workflow,
  new RegExp(
    `container:\\s*\\n\\s+image:\\s*mcr\\.microsoft\\.com/playwright:v${playwrightVersion}-noble`,
  ),
);
const conditionBlock = deploymentStep.match(
  /if:\s*>-\s*([\s\S]*?)\n\s*env:/,
)?.[1];
assert.equal(
  conditionBlock?.replace(/\s+/g, " ").trim(),
  EXPECTED_DEPLOY_CONDITION,
  "deployment must require every safety gate together",
);
for (const stepName of [
  "Save scanned release images",
  "Assemble production release bundle",
  "Preflight production deployment",
  "Deploy and verify, rolling back on failed public health checks",
]) {
  const stepStart = releaseJob.indexOf(`      - name: ${stepName}`);
  assert.notEqual(stepStart, -1, `release step must exist: ${stepName}`);
  const followingStep = releaseJob.indexOf("\n      - name:", stepStart + 1);
  const step = releaseJob.slice(
    stepStart,
    followingStep === -1 ? undefined : followingStep,
  );
  assert.match(
    step,
    /needs\.sonar-analysis\.result == 'success'/,
    `${stepName} must require a successful SonarQube analysis`,
  );
}
assert.doesNotMatch(
  beforeReleaseJob,
  /PRODUCTION_SSH_(?:HOST|USER|PRIVATE_KEY|KNOWN_HOSTS)/,
  "quality checks must not receive production deployment SSH credentials",
);
assert.doesNotMatch(
  workflow.slice(0, sonarJobStart),
  /SONAR_SSH_(?:HOST|USER|PRIVATE_KEY|KNOWN_HOSTS)/,
  "other quality jobs must not receive the private SonarQube tunnel credentials",
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
    name: "failed SonarQube quality gate",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    e2e: "success",
    audit: "success",
    sonar: "failure",
    enabled: "true",
    expected: false,
  },
  {
    name: "unavailable SonarQube analysis",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    e2e: "success",
    audit: "success",
    sonar: "failure",
    enabled: "true",
    expected: false,
  },
  {
    name: "incomplete SonarQube analysis",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    e2e: "success",
    audit: "success",
    sonar: "skipped",
    enabled: "true",
    expected: false,
  },
  {
    name: "canceled SonarQube analysis",
    event: "workflow_dispatch",
    ref: "refs/heads/main",
    actor: "fernandezpastoreduardo",
    triggeringActor: "fernandezpastoreduardo",
    approve: true,
    quality: "success",
    e2e: "success",
    audit: "success",
    sonar: "cancelled",
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
    (context.sonar ?? "success") === "success" &&
    deploymentStep.includes("needs.e2e.result == 'success'") &&
    deploymentStep.includes("needs.sonar-analysis.result == 'success'") &&
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
  /aquasecurity\/setup-trivy@81e514348e19b6112ce2a7e3ecbafe19c1e1f567 # v0\.3\.1/,
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

const aiSmokeStart = workflow.indexOf(
  "- name: Verify OpenAI idea evaluation and roast before release",
);
const saveImagesStart = workflow.indexOf("- name: Save scanned release images");
const aiSmokeEnd = workflow.indexOf("      - name:", aiSmokeStart + 1);
assert.ok(aiSmokeStart >= 0, "OpenAI production smoke step must exist");
const aiSmokeStep = workflow.slice(
  aiSmokeStart,
  aiSmokeEnd === -1 ? undefined : aiSmokeEnd,
);
const aiSmokeCondition = aiSmokeStep.match(
  /if:\s*>-\s*([\s\S]*?)\n\s*env:/,
)?.[1];
assert.equal(
  aiSmokeCondition?.replace(/\s+/g, " ").trim(),
  [
    "github.event_name == 'workflow_dispatch'",
    "github.actor == 'fernandezpastoreduardo'",
    "github.triggering_actor == 'fernandezpastoreduardo'",
    "github.ref == 'refs/heads/main'",
    "inputs.approve_production_deploy == true",
    "vars.PRODUCTION_DEPLOY_ENABLED == 'true'",
  ].join(" && "),
  "OpenAI smoke must run only on the approved main release dispatch",
);
assert.match(
  aiSmokeStep,
  /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/,
  "OpenAI key must be scoped to the live smoke step",
);
assert.equal(
  [...workflow.matchAll(/secrets\.OPENAI_API_KEY/g)].length,
  1,
  "no workflow or job scope may expose the OpenAI key outside its smoke step",
);
assert.match(
  aiSmokeStep,
  /API_IMAGE: grumphya-api:\$\{\{ github\.sha \}\}/,
  "OpenAI smoke must target the API image built for this candidate SHA",
);
assert.match(
  aiSmokeStep,
  /:\s+"\$\{OPENAI_API_KEY:\?[^\n]+\}"[\s\S]*?timeout 300s docker run --rm --entrypoint node[\s\S]*?--env OPENAI_API_KEY[\s\S]*?"\$API_IMAGE"[\s\S]*?apps\/api\/dist\/infrastructure\/ai\/production-ai-smoke\.js/,
  "missing credentials or a failed candidate smoke must fail the CI step",
);
assert.ok(
  aiSmokeStart > imageScanStart && aiSmokeStart < saveImagesStart,
  "OpenAI smoke must pass after image scanning and before release packaging",
);

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
