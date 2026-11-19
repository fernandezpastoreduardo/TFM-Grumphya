import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertNoDuplicateReleaseAttestation,
  buildAuditEvidenceRows,
  stableJson,
  verifyReleaseManifest,
} from "./audit-evidence-writer";

const RESOURCES = [
  "infrastructure",
  "deployment",
  "dependencies",
  "auth",
  "quality",
  "privacy",
  "ai",
] as const;

function createSignedManifest() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const observedAt = new Date("2026-11-19T10:00:00.000Z");
  const validUntil = new Date("2026-11-20T10:00:00.000Z");
  const manifest: Record<string, unknown> = {
    schemaVersion: "beta-d-0.2",
    environment: "production",
    observedAt: observedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    deployment: {
      deploymentSha: "a".repeat(40),
      images: Object.fromEntries(
        ["api", "web", "database", "proxy"].map((name) => [
          name,
          `sha256:${"b".repeat(64)}`,
        ]),
      ),
      checks: [{ name: "trivy", status: "passed" }],
    },
    deploymentDigest: `sha256:${"c".repeat(64)}`,
    dependencies: {
      packageCount: 2,
      dependencyInventoryDigest: "d".repeat(64),
      highRiskCount: 0,
      criticalRiskCount: 0,
    },
    audit: { envelopes: {} },
  };
  const envelopes = manifest.audit as { envelopes: Record<string, unknown> };
  for (const resource of RESOURCES) {
    const envelope = {
      hostname: "grumphya.com",
      environment: "production",
      generatedAt: observedAt.toISOString(),
      expiresAt: validUntil.toISOString(),
      profile: "beta-d-0.2",
      scope: `audit:${resource}`,
      evidence: [{ resource, observed: true }],
      kid: "ds-auditor-2026",
      attestation: {
        alg: "EdDSA",
        kid: "grumphya-release-2026",
        signature: "",
      },
    };
    const unsigned = Object.fromEntries(
      Object.entries(envelope).filter(([key]) => key !== "attestation"),
    );
    envelope.attestation.signature = sign(
      null,
      Buffer.from(stableJson(unsigned)),
      privateKey,
    ).toString("base64url");
    envelopes.envelopes[resource] = envelope;
  }
  const manifestText = stableJson(manifest);
  const signature = sign(null, Buffer.from(manifestText), privateKey).toString(
    "base64url",
  );
  return {
    manifestText,
    signature,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    observedAt,
  };
}

describe("audit evidence writer", () => {
  it("verifies the signed release and builds five internal evidence rows", () => {
    const fixture = createSignedManifest();
    const release = verifyReleaseManifest(
      fixture.manifestText,
      fixture.signature,
      fixture.publicKeyPem,
      new Date("2026-11-19T12:00:00.000Z"),
    );

    expect(buildAuditEvidenceRows(release)).toHaveLength(5);
    expect(
      buildAuditEvidenceRows(release).every((row) => row.cardinality === 1),
    ).toBe(true);
  });

  it("rejects an invalid release signature", () => {
    const fixture = createSignedManifest();

    expect(() =>
      verifyReleaseManifest(
        fixture.manifestText,
        `${fixture.signature}invalid`,
        fixture.publicKeyPem,
        new Date("2026-11-19T12:00:00.000Z"),
      ),
    ).toThrow("signature is invalid");
  });

  it("rejects an expired release", () => {
    const fixture = createSignedManifest();

    expect(() =>
      verifyReleaseManifest(
        fixture.manifestText,
        fixture.signature,
        fixture.publicKeyPem,
        new Date("2026-11-20T12:00:01.000Z"),
      ),
    ).toThrow("expired");
  });

  it("rejects a duplicate release attestation", () => {
    expect(() => assertNoDuplicateReleaseAttestation(1)).toThrow("Duplicate");
    expect(() => assertNoDuplicateReleaseAttestation(0)).not.toThrow();
  });
});
