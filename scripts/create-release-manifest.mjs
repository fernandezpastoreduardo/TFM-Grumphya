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
const AUDIT_RELEASE_ATTESTATION_KID = "grumphya-release-2026";
const AUDIT_JWT_KID = "ds-auditor-2026";

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function collectDependencies(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectDependencies(item);
    return;
  }
  if (typeof value.name === "string" && typeof value.version === "string") {
    packageVersions.add(`${value.name}@${value.version}`);
  }
  if (value.dependencies && typeof value.dependencies === "object") {
    for (const dependency of Object.values(value.dependencies)) {
      collectDependencies(dependency);
    }
  }
}

collectDependencies(inventory);
const observedAt = new Date();
const validUntil = new Date(observedAt.getTime() + 24 * 60 * 60 * 1000);
const dependencyInventoryDigest = createHash("sha256")
  .update(inventoryText)
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
const deploymentDigest = `sha256:${createHash("sha256")
  .update(stableJson(deployment.images))
  .digest("hex")}`;
const dependencies = {
  packageCount: packageVersions.size,
  dependencyInventoryDigest,
  highRiskCount: Number(security.highRiskCount ?? 0),
  criticalRiskCount: Number(security.criticalRiskCount ?? 0),
};
const auditEnvelope = (evidence) => ({
  hostname: "grumphya.com",
  environment: "production",
  generatedAt: observedAt.toISOString(),
  expiresAt: validUntil.toISOString(),
  profile: "beta-d-0.2",
  scope: `audit:${evidence === deployment ? "deployment" : "dependencies"}`,
  evidence,
  kid: AUDIT_JWT_KID,
  attestation: {
    alg: "EdDSA",
    kid: AUDIT_RELEASE_ATTESTATION_KID,
    signature: "",
  },
});
const manifest = {
  schemaVersion: "beta-d-0.2",
  environment: "production",
  observedAt: observedAt.toISOString(),
  validUntil: validUntil.toISOString(),
  deployment,
  deploymentDigest,
  dependencies,
  audit: {
    envelopes: {
      deployment: auditEnvelope(deployment),
      dependencies: auditEnvelope(dependencies),
    },
  },
};

await writeFile(outputPath, stableJson(manifest), { mode: 0o600 });
