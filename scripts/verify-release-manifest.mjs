import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

const [, , manifestPath, signaturePath, publicKeyPath, expectedSha] =
  process.argv;
if (
  !manifestPath ||
  !signaturePath ||
  !publicKeyPath ||
  !/^[0-9a-f]{40}$/u.test(expectedSha ?? "")
) {
  process.exit(2);
}

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

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const signature = Buffer.from(
    (await readFile(signaturePath, "utf8")).trim(),
    "base64url",
  );
  const publicKey = createPublicKey(await readFile(publicKeyPath, "utf8"));
  const validUntil = Date.parse(manifest.validUntil);
  const observedAt = Date.parse(manifest.observedAt);
  const imageDigests = manifest.deployment?.images;
  const hasImageDigests =
    imageDigests &&
    Object.values(imageDigests).length === 4 &&
    Object.values(imageDigests).every((value) =>
      /^sha256:[0-9a-f]{64}$/u.test(value),
    );
  const valid =
    verify(null, Buffer.from(stableJson(manifest)), publicKey, signature) &&
    manifest.schemaVersion === "ds-audit-v1" &&
    manifest.environment === "production" &&
    manifest.deployment?.deploymentSha === expectedSha &&
    hasImageDigests &&
    typeof manifest.dependencies?.dependencyInventoryDigest === "string" &&
    /^[0-9a-f]{64}$/u.test(manifest.dependencies.dependencyInventoryDigest) &&
    Number.isFinite(observedAt) &&
    Number.isFinite(validUntil) &&
    validUntil > observedAt;
  process.exit(valid ? 0 : 1);
} catch {
  process.exit(1);
}
