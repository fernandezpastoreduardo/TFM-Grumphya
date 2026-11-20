import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const [securityPath, composePath, browserPath, outputPath] =
  process.argv.slice(2);
const REQUIRED_CI_RESULTS = [
  "CI_QUALITY_RESULT",
  "CI_E2E_RESULT",
  "CI_DEPENDENCY_RESULT",
];
const MAX_DEPENDENCY_RISKS = 1000;
const MAX_THIRD_PARTY_ORIGINS = 1;
const ACCESSIBILITY_LIMIT = 0;
const RESPONSE_TIME_LIMIT_MS = 2500;
const FIRST_CONTENTFUL_PAINT_LIMIT_MS = 1800;
const INTERACTION_LIMIT_MS = 200;

function assertRecord(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
  return value;
}

async function readJson(path, label) {
  assert.ok(path, `Falta la ruta de ${label}.`);
  return assertRecord(JSON.parse(await readFile(path, "utf8")), label);
}

function gatePassed(name) {
  const value = process.env[name];
  assert.equal(value, "success", `La puerta ${name} no terminó correctamente.`);
  return true;
}

function booleanSignal(criterionId, reasonCode, failReasonCode, observed) {
  return {
    criterionId,
    status: observed ? "pass" : "fail",
    reasonCode: observed ? reasonCode : failReasonCode,
    value: observed ? 1 : 0,
    unit: "boolean",
  };
}

function countSignal(criterionId, reasonCode, failReasonCode, value, limit) {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 1000);
  return {
    criterionId,
    status: value <= limit ? "pass" : "fail",
    reasonCode: value <= limit ? reasonCode : failReasonCode,
    value,
    unit: "count",
    limit,
  };
}

function timingSignal(criterionId, reasonCode, value, limit) {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 120_000);
  return {
    criterionId,
    status: value <= limit ? "pass" : "fail",
    reasonCode,
    value,
    unit: "milliseconds",
    limit,
  };
}

function buildSignals(security, compose, browser) {
  const secretCount = security.secretCount;
  const highRiskCount = security.highRiskCount;
  const criticalRiskCount = security.criticalRiskCount;
  assert.equal(security.trivy?.status, "passed");
  assert.ok(Number.isInteger(secretCount) && secretCount >= 0);
  assert.ok(Number.isInteger(highRiskCount) && highRiskCount >= 0);
  assert.ok(Number.isInteger(criticalRiskCount) && criticalRiskCount >= 0);

  const dependencyRiskCount = highRiskCount + criticalRiskCount;
  const infrastructure = [
    booleanSignal(
      "infrastructure.tls",
      "infrastructure_transport_verified",
      "infrastructure_transport_incomplete",
      compose.tlsTransportVerified === true,
    ),
    booleanSignal(
      "infrastructure.headers",
      "security_headers_verified",
      "security_headers_missing",
      compose.securityHeadersVerified === true,
    ),
    booleanSignal(
      "infrastructure.network",
      "network_surface_allowlisted",
      "network_surface_restricted",
      compose.networkSurfaceRestricted === true,
    ),
  ];
  const deployment = [
    booleanSignal(
      "application.secrets",
      "secrets_not_in_image",
      "secrets_present_in_image",
      secretCount === 0,
    ),
  ];
  const dependencies = [
    countSignal(
      "application.dependencies",
      "dependency_risk_not_observed",
      criticalRiskCount > 0
        ? "critical_dependency_risk_observed"
        : "high_dependency_risk_observed",
      dependencyRiskCount,
      MAX_DEPENDENCY_RISKS,
    ),
  ];
  const authPassed = gatePassed("CI_QUALITY_RESULT");
  const auth = [
    booleanSignal(
      "authentication.authorization",
      "authorization_flow_passed",
      "authorization_flow_failed",
      authPassed,
    ),
  ];
  const e2ePassed = gatePassed("CI_E2E_RESULT");
  gatePassed("CI_DEPENDENCY_RESULT");
  const quality = [
    booleanSignal("quality.e2e", "release_checks", "release_checks", e2ePassed),
    countSignal(
      "quality.accessibility",
      "accessibility_critical_violations",
      "accessibility_critical_violations",
      browser.criticalAccessibilityViolations,
      ACCESSIBILITY_LIMIT,
    ),
    timingSignal(
      "performance.page_load",
      "response_time",
      browser.responseTimeMs,
      RESPONSE_TIME_LIMIT_MS,
    ),
    timingSignal(
      "performance.page_load",
      "first_contentful_paint",
      browser.firstContentfulPaintMs,
      FIRST_CONTENTFUL_PAINT_LIMIT_MS,
    ),
    timingSignal(
      "performance.page_load",
      "interaction_to_next_paint",
      browser.interactionToNextPaintMs,
      INTERACTION_LIMIT_MS,
    ),
  ];
  const observedStorageIsEssential =
    browser.firstPartyCookiesOnly === true &&
    browser.essentialStorageOnly === true;
  const privacy = [
    booleanSignal(
      "privacy.cookies",
      "essential_storage_only_before_consent",
      "nonessential_storage_before_consent",
      observedStorageIsEssential,
    ),
    countSignal(
      "privacy.third_parties",
      "third_party_origin_count",
      "third_party_origin_count",
      browser.thirdPartyOriginCount,
      MAX_THIRD_PARTY_ORIGINS,
    ),
    booleanSignal(
      "privacy.third_parties",
      "third_party_origins_allowlisted",
      "third_party_origin_not_allowlisted",
      browser.thirdPartyOriginsAllowlisted === true,
    ),
    booleanSignal(
      "privacy.consent",
      "consent_choice_selected",
      "consent_choice_not_selected",
      browser.privacyChoiceSelected === true,
    ),
    booleanSignal(
      "ethics.transparency",
      "privacy_notice_present",
      "privacy_notice_missing",
      browser.privacyPolicyVisible === true,
    ),
  ];
  const ai = [
    booleanSignal(
      "ai.disclosure",
      "ai_disclosure_present",
      "ai_disclosure_missing",
      browser.aiDisclosureVisible === true,
    ),
  ];

  return {
    infrastructure,
    deployment,
    dependencies,
    auth,
    quality,
    privacy,
    ai,
  };
}

const [security, compose, browser] = await Promise.all([
  readJson(securityPath, "resultados de seguridad"),
  readJson(composePath, "pruebas de Compose"),
  readJson(browserPath, "mediciones de navegador"),
]);
assert.ok(outputPath, "Falta la ruta de salida de señales.");
for (const resultName of REQUIRED_CI_RESULTS) gatePassed(resultName);

const signals = buildSignals(security, compose, browser);
await writeFile(outputPath, `${JSON.stringify(signals)}\n`, { mode: 0o600 });
const failed = Object.values(signals)
  .flat()
  .filter((signal) => signal.status === "fail");
const totalSignals = Object.values(signals).reduce(
  (total, resourceSignals) => total + resourceSignals.length,
  0,
);
if (failed.length > 0) {
  process.stderr.write(
    `La release no cumple ${failed.length} señales de auditoría medidas.\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Evidencias reales de release generadas: ${totalSignals} señales pass.\n`,
  );
}
