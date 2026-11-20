import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AUDIT_RESOURCES } from "./audit.models";
import { canonicalJson, sampleRefForSignals } from "./audit-signals";
import type { AuditSignal } from "./audit-signals";
import {
  assertNoDuplicateReleaseAttestation,
  buildAuditEvidenceRows,
  stableJson,
  verifyReleaseManifest,
} from "./audit-evidence-writer";

function createSignedManifest() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const observedAt = new Date("2026-11-19T10:00:00.000Z");
  const validUntil = new Date("2026-11-20T10:00:00.000Z");
  const deploymentDigest = "sha256:" + "c".repeat(64);
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
          "sha256:" + "b".repeat(64),
        ]),
      ),
      checks: [],
    },
    deploymentDigest,
    dependencies: {
      packageCount: 2,
      dependencyInventoryDigest: "d".repeat(64),
      highRiskCount: 0,
      criticalRiskCount: 0,
    },
    audit: { envelopes: {} },
  };
  const envelopes = (manifest.audit as { envelopes: Record<string, unknown> })
    .envelopes;
  for (const resource of AUDIT_RESOURCES) {
    const signals: AuditSignal[] =
      resource === "quality"
        ? [
            {
              criterionId: "quality.accessibility",
              status: "unknown",
              reasonCode: "accessibility_critical_violations",
              value: null,
              unit: "count",
              limit: 0,
            },
          ]
        : [];
    const item = {
      observedAt: observedAt.toISOString(),
      sampleRef: sampleRefForSignals(signals),
      signals,
    };
    const envelope = {
      schemaVersion: "beta-d-0.2",
      observedAt: observedAt.toISOString(),
      validUntil: validUntil.toISOString(),
      environment: "production",
      deploymentDigest,
      cardinality: 1,
      evidence: item,
      attestation: {
        alg: "EdDSA",
        kid: "grumphya-release-2026",
        signature: "",
      },
    };
    const unsigned = {
      schemaVersion: envelope.schemaVersion,
      observedAt: envelope.observedAt,
      validUntil: envelope.validUntil,
      environment: envelope.environment,
      deploymentDigest,
      cardinality: 1,
      evidence: item,
    };
    envelope.attestation.signature = sign(
      null,
      Buffer.from(canonicalJson(unsigned)),
      privateKey,
    ).toString("base64url");
    envelopes[resource] = envelope;
  }
  const manifestText = stableJson(manifest);
  return {
    manifestText,
    signature: sign(null, Buffer.from(manifestText), privateKey).toString(
      "base64url",
    ),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    observedAt,
  };
}
describe("audit evidence writer", () => {
  it("verifies the signed release and builds five internal rows", () => {
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
        fixture.signature + "invalid",
        fixture.publicKeyPem,
        new Date("2026-11-19T12:00:00.000Z"),
      ),
    ).toThrow("signature is invalid");
  });
  it("rejects an expired release and duplicate attestation", () => {
    const fixture = createSignedManifest();
    expect(() =>
      verifyReleaseManifest(
        fixture.manifestText,
        fixture.signature,
        fixture.publicKeyPem,
        new Date("2026-11-20T12:00:01.000Z"),
      ),
    ).toThrow();
    expect(() => assertNoDuplicateReleaseAttestation(1)).toThrow("Duplicate");
    expect(() => assertNoDuplicateReleaseAttestation(0)).not.toThrow();
  });
});
