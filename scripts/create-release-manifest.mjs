import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [, , outputPath, inventoryPath, securityPath, deploymentSha, ...digests] =
  process.argv;
if (
  !outputPath ||
  !inventoryPath ||
  !securityPath ||
  !deploymentSha ||
  digests.length !== 4 ||
  !/^[0-9a-f]{40}$/u.test(deploymentSha) ||
  digests.some((digest) => !/^sha256:[0-9a-f]{64}$/u.test(digest))
) {
  throw new Error(
    "Usage: create-release-manifest.mjs <output> <inventory> <security> <sha> <api> <web> <database> <proxy>",
  );
}
const inventoryText = await readFile(inventoryPath, "utf8");
const inventory = JSON.parse(inventoryText);
const security = JSON.parse(await readFile(securityPath, "utf8"));
const packageVersions = new Set();
const RELEASE_KID = "grumphya-release-2026";
const JWT_KID = "ds-auditor-2026";
function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => JSON.stringify(key) + ":" + stableJson(child))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
function collectDependencies(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectDependencies(item);
    return;
  }
  if (typeof value.name === "string" && typeof value.version === "string")
    packageVersions.add(value.name + "@" + value.version);
  if (value.dependencies && typeof value.dependencies === "object")
    for (const dependency of Object.values(value.dependencies))
      collectDependencies(dependency);
}
collectDependencies(inventory);
const observedAt = new Date();
const validUntil = new Date(observedAt.getTime() + 24 * 60 * 60 * 1000);
const dependencyInventoryDigest = createHash("sha256")
  .update(inventoryText, "utf8")
  .digest("hex");
const deployment = {
  deploymentSha,
  images: {
    api: digests[0],
    web: digests[1],
    database: digests[2],
    proxy: digests[3],
  },
  checks: [{ name: "trivy", status: security.trivy?.status ?? "unknown" }],
};
const deploymentDigest =
  "sha256:" +
  createHash("sha256")
    .update(stableJson(deployment.images), "utf8")
    .digest("hex");
const dependencies = {
  packageCount: packageVersions.size,
  dependencyInventoryDigest,
  highRiskCount: Number(security.highRiskCount ?? 0),
  criticalRiskCount: Number(security.criticalRiskCount ?? 0),
};
const unknown = (criterionId, reasonCode, unit, limit) => ({
  criterionId,
  status: "unknown",
  reasonCode,
  value: null,
  unit,
  ...(limit === undefined ? {} : { limit }),
});
const signals = {
  infrastructure: [
    unknown(
      "infrastructure.tls",
      "infrastructure_transport_incomplete",
      "boolean",
    ),
    unknown("infrastructure.headers", "security_headers_unobserved", "boolean"),
    unknown("infrastructure.network", "network_surface_unobserved", "boolean"),
  ],
  deployment: [
    unknown("application.secrets", "secrets_check_unavailable", "boolean"),
  ],
  dependencies: [
    unknown(
      "application.dependencies",
      "dependency_risk_not_observed",
      "count",
      1000,
    ),
  ],
  auth: [
    unknown(
      "authentication.authorization",
      "technical_contract_mismatch",
      "boolean",
    ),
  ],
  quality: [
    unknown("quality.e2e", "release_checks", "boolean"),
    unknown(
      "quality.accessibility",
      "accessibility_critical_violations",
      "count",
      0,
    ),
    unknown("performance.page_load", "response_time", "milliseconds", 2500),
    unknown(
      "performance.page_load",
      "first_contentful_paint",
      "milliseconds",
      1800,
    ),
    unknown(
      "performance.page_load",
      "interaction_to_next_paint",
      "milliseconds",
      200,
    ),
  ],
  privacy: [
    unknown(
      "privacy.cookies",
      "essential_storage_only_before_consent",
      "boolean",
    ),
    unknown(
      "privacy.third_parties",
      "third_party_request_count",
      "count",
      1000,
    ),
    unknown("privacy.consent", "consent_choice_recorded", "boolean"),
    unknown("ethics.transparency", "privacy_notice_unobserved", "boolean"),
  ],
  ai: [unknown("ai.disclosure", "ai_disclosure_unobserved", "boolean")],
};
function evidenceFor(resource) {
  const list = signals[resource];
  return {
    observedAt: observedAt.toISOString(),
    sampleRef:
      "sha256:" +
      createHash("sha256").update(stableJson(list), "utf8").digest("hex"),
    signals: list,
  };
}
function auditEnvelope(resource) {
  return {
    schemaVersion: "beta-d-0.2",
    observedAt: observedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    environment: "production",
    deploymentDigest,
    cardinality: 1,
    evidence: evidenceFor(resource),
    attestation: { alg: "EdDSA", kid: RELEASE_KID, signature: "" },
  };
}
const manifest = {
  schemaVersion: "beta-d-0.2",
  environment: "production",
  observedAt: observedAt.toISOString(),
  validUntil: validUntil.toISOString(),
  deployment,
  deploymentDigest,
  dependencies,
  audit: {
    envelopes: Object.fromEntries(
      [
        "infrastructure",
        "deployment",
        "dependencies",
        "auth",
        "quality",
        "privacy",
        "ai",
      ].map((resource) => [resource, auditEnvelope(resource)]),
    ),
  },
};
await writeFile(outputPath, stableJson(manifest), { mode: 0o600 });
