import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalJson,
  sampleRefForSignals,
  type AuditEvidence,
  type AuditSignal,
} from "./audit-signals";
import type { AuditEvidenceRepository } from "./audit.models";
import { AuditService } from "./audit.service";
import type { AuditTechnicalIdentity } from "./audit-technical-auth";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
const NOW = new Date("2026-11-19T12:00:00.000Z");
const OBSERVED_AT = new Date("2026-11-19T11:00:00.000Z");
const VALID_UNTIL = new Date("2026-11-20T11:00:00.000Z");
const DIGEST = "sha256:" + "a".repeat(64);
const RELEASE_KID = "grumphya-release-2026";
const identity: AuditTechnicalIdentity = {
  issuer: "desarrolloseguro-audit",
  subject: "desarrolloseguro-audit",
  audience: "grumphya-audit",
  environment: "production",
  domain: "grumphya.com",
  hostname: "grumphya.com",
  scopes: new Set(["audit:quality"]),
  issuedAt: 1,
  expiresAt: 2,
  jti: "request-1",
  kid: "ds-auditor-2026",
};
function evidence(signals: AuditSignal[] = []): AuditEvidence {
  return {
    observedAt: OBSERVED_AT.toISOString(),
    sampleRef: sampleRefForSignals(signals),
    signals,
  };
}
function attestation(unsigned: Record<string, unknown>) {
  return {
    alg: "EdDSA" as const,
    kid: RELEASE_KID,
    signature: sign(
      null,
      Buffer.from(canonicalJson(unsigned)),
      privateKey,
    ).toString("base64url"),
  };
}
function repository(
  resource: "quality" | "privacy" = "quality",
  signals: AuditSignal[] = [],
): AuditEvidenceRepository {
  const item = evidence(signals);
  const unsigned = {
    schemaVersion: "beta-d-0.2",
    observedAt: item.observedAt,
    validUntil: VALID_UNTIL.toISOString(),
    environment: "production",
    deploymentDigest: DIGEST,
    cardinality: 1,
    evidence: item,
  };
  return {
    findLatestEvidence: async () => ({
      resource,
      observedAt: OBSERVED_AT,
      validUntil: VALID_UNTIL,
      environment: "production",
      deploymentDigest: DIGEST,
      jwtKid: "ds-auditor-2026",
      cardinality: 1,
      evidence: item,
      attestation: attestation(unsigned),
    }),
    findLatestReleaseAttestation: async () => null,
  };
}
function configure(): void {
  process.env.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY = PUBLIC_KEY;
  process.env.AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS = RELEASE_KID;
  process.env.DEPLOY_SHA = "a".repeat(40);
}
afterEach(() => {
  delete process.env.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY;
  delete process.env.AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS;
  delete process.env.DEPLOY_SHA;
});

describe("AuditService", () => {
  it("returns the exact beta-d-0.2 wrapper", async () => {
    configure();
    const result = await new AuditService(repository(), () => NOW).read(
      "quality",
      identity,
    );
    expect(Object.keys(result).sort()).toEqual([
      "attestation",
      "cardinality",
      "deploymentDigest",
      "environment",
      "evidence",
      "observedAt",
      "schemaVersion",
      "validUntil",
    ]);
    expect(result).toMatchObject({
      schemaVersion: "beta-d-0.2",
      environment: "production",
      deploymentDigest: DIGEST,
      cardinality: 1,
      attestation: { alg: "EdDSA", kid: RELEASE_KID },
    });
  });
  it("rejects malformed, expired and wrong-cardinality stored evidence", async () => {
    configure();
    const malformed = repository();
    const malformedRecord = await repository().findLatestEvidence("quality");
    malformed.findLatestEvidence = async () =>
      malformedRecord
        ? {
            ...malformedRecord,
            evidence: {
              observedAt: OBSERVED_AT.toISOString(),
              sampleRef: "sha256:" + "0".repeat(64),
              signals: [
                {
                  criterionId: "quality.e2e",
                  status: "unknown",
                  reasonCode: "release_checks",
                  value: null,
                  unit: "boolean",
                },
              ],
            },
          }
        : null;
    await expect(
      new AuditService(malformed, () => NOW).read("quality", identity),
    ).rejects.toMatchObject({ status: 503 });
    const expired = repository();
    const expiredRecord = await repository().findLatestEvidence("quality");
    expired.findLatestEvidence = async () =>
      expiredRecord
        ? {
            ...expiredRecord,
            observedAt: new Date("2026-11-17T00:00:00.000Z"),
            validUntil: new Date("2026-11-18T00:00:00.000Z"),
          }
        : null;
    await expect(
      new AuditService(expired, () => NOW).read("quality", identity),
    ).rejects.toMatchObject({ status: 503 });
  });
});
