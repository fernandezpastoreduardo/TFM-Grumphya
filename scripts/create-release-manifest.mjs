import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [, , outputPath, inventoryPath, securityPath, deploymentSha, ...digests] =
  process.argv;
const [apiDigest, webDigest, databaseDigest, proxyDigest, evidencePath] =
  digests;
if (
  !outputPath ||
  !inventoryPath ||
  !securityPath ||
  !deploymentSha ||
  digests.length !== 5 ||
  !/^[0-9a-f]{40}$/u.test(deploymentSha) ||
  [apiDigest, webDigest, databaseDigest, proxyDigest].some(
    (digest) => !/^sha256:[0-9a-f]{64}$/u.test(digest),
  )
) {
  throw new Error(
    "Usage: create-release-manifest.mjs <output> <inventory> <security> <sha> <api> <web> <database> <proxy> <audit-evidence>",
  );
}
const inventoryText = await readFile(inventoryPath, "utf8");
const inventory = JSON.parse(inventoryText);
const security = JSON.parse(await readFile(securityPath, "utf8"));
const auditSignals = JSON.parse(await readFile(evidencePath, "utf8"));
const packageVersions = new Set();
const RELEASE_KID = "grumphya-release-2026";
const AUDIT_RESOURCES = [
  "infrastructure",
  "deployment",
  "dependencies",
  "auth",
  "quality",
  "privacy",
  "ai",
];
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
    api: apiDigest,
    web: webDigest,
    database: databaseDigest,
    proxy: proxyDigest,
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
if (
  !auditSignals ||
  typeof auditSignals !== "object" ||
  Array.isArray(auditSignals) ||
  Object.keys(auditSignals).sort().join(",") !==
    [...AUDIT_RESOURCES].sort().join(",")
) {
  throw new Error(
    "La evidencia medida no contiene exactamente los siete recursos.",
  );
}
for (const resource of AUDIT_RESOURCES) {
  const signals = auditSignals[resource];
  if (
    !Array.isArray(signals) ||
    signals.length === 0 ||
    signals.some(
      (signal) =>
        !signal ||
        typeof signal !== "object" ||
        !["pass", "fail"].includes(signal.status),
    )
  ) {
    throw new Error(
      `La evidencia de ${resource} debe incluir señales pass/fail.`,
    );
  }
}
const failedSignals = AUDIT_RESOURCES.flatMap((resource) =>
  auditSignals[resource].filter((signal) => signal.status === "fail"),
);
if (failedSignals.length > 0) {
  throw new Error(
    `La release contiene ${failedSignals.length} señales fail; no se generará ni firmará el manifiesto.`,
  );
}
function evidenceFor(resource) {
  const list = auditSignals[resource];
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
      AUDIT_RESOURCES.map((resource) => [resource, auditEnvelope(resource)]),
    ),
  },
};
await writeFile(outputPath, stableJson(manifest), { mode: 0o600 });
