import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

const [, , manifestPath, signaturePath, publicKeyPath, expectedSha] =
  process.argv;
const RELEASE_ATTESTATION_KID = "grumphya-release-2026";
const AUDIT_JWT_KID = "ds-auditor-2026";
const AUDIT_RESOURCES = [
  "infrastructure",
  "deployment",
  "dependencies",
  "auth",
  "quality",
  "privacy",
  "ai",
];
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
  const hasAuditEnvelopes = AUDIT_RESOURCES.every((resource) => {
    const envelope = manifest.audit?.envelopes?.[resource];
    if (!envelope) return false;
    const { attestation, ...unsigned } = envelope;
    if (
      envelope.hostname !== "grumphya.com" ||
      envelope.environment !== "production" ||
      envelope.profile !== "beta-d-0.2" ||
      envelope.scope !== `audit:${resource}` ||
      envelope.kid !== AUDIT_JWT_KID ||
      !Number.isFinite(Date.parse(envelope.generatedAt)) ||
      !Number.isFinite(Date.parse(envelope.expiresAt)) ||
      Date.parse(envelope.expiresAt) <= Date.parse(envelope.generatedAt) ||
      !Array.isArray(envelope.evidence) ||
      envelope.evidence.length !== 1 ||
      attestation?.alg !== "EdDSA" ||
      attestation.kid !== RELEASE_ATTESTATION_KID ||
      typeof attestation.signature !== "string" ||
      !attestation.signature
    ) {
      return false;
    }
    return verify(
      null,
      Buffer.from(stableJson(unsigned)),
      publicKey,
      Buffer.from(attestation.signature, "base64url"),
    );
  });
  const valid =
    verify(null, Buffer.from(stableJson(manifest)), publicKey, signature) &&
    manifest.schemaVersion === "beta-d-0.2" &&
    manifest.environment === "production" &&
    manifest.deployment?.deploymentSha === expectedSha &&
    /^sha256:[0-9a-f]{64}$/u.test(manifest.deploymentDigest ?? "") &&
    hasImageDigests &&
    hasAuditEnvelopes &&
    typeof manifest.dependencies?.dependencyInventoryDigest === "string" &&
    /^[0-9a-f]{64}$/u.test(manifest.dependencies.dependencyInventoryDigest) &&
    Number.isFinite(observedAt) &&
    Number.isFinite(validUntil) &&
    validUntil > observedAt;
  process.exit(valid ? 0 : 1);
} catch {
  process.exit(1);
}
