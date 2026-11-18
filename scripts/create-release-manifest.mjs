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
const manifest = {
  schemaVersion: "ds-audit-v1",
  environment: "production",
  observedAt: observedAt.toISOString(),
  validUntil: validUntil.toISOString(),
  deployment: {
    deploymentSha,
    images: {
      api: digests[0],
      web: digests[1],
      database: digests[2],
      proxy: digests[3],
    },
    checks: [{ name: "trivy", status: security.trivy?.status ?? "unknown" }],
  },
  dependencies: {
    packageCount: packageVersions.size,
    dependencyInventoryDigest,
    highRiskCount: Number(security.highRiskCount ?? 0),
    criticalRiskCount: Number(security.criticalRiskCount ?? 0),
  },
};

await writeFile(outputPath, JSON.stringify(manifest), { mode: 0o600 });
