import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditEvidenceRepository } from "./audit.models";
import { AuditService } from "./audit.service";
import type { AuditTechnicalIdentity } from "./audit-technical-auth";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
const NOW = new Date("2026-11-18T20:00:00.000Z");
const OBSERVED_AT = new Date("2026-11-18T19:00:00.000Z");
const VALID_UNTIL = new Date("2026-11-19T19:00:00.000Z");
const JWT_KID = "ds-auditor-2026";
const RELEASE_KID = "grumphya-release-2026";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const identity: AuditTechnicalIdentity = {
  issuer: "desarrolloseguro-audit",
  audience: "grumphya-audit",
  environment: "production",
  domain: "grumphya.com",
  hostname: "grumphya.com",
  scopes: new Set(["audit:quality", "audit:deployment", "audit:dependencies"]),
  issuedAt: Math.floor(NOW.getTime() / 1000) - 60,
  expiresAt: Math.floor(NOW.getTime() / 1000) + 240,
  jti: "reader-request-1",
  kid: JWT_KID,
};

function attestationFor(unsigned: Record<string, unknown>) {
  return {
    alg: "EdDSA" as const,
    kid: RELEASE_KID,
    signature: sign(
      null,
      Buffer.from(stableJson(unsigned)),
      privateKey,
    ).toString("base64url"),
  };
}

function evidenceEnvelope(resource: string, evidence: unknown) {
  const unsigned = {
    hostname: "grumphya.com" as const,
    environment: "production" as const,
    generatedAt: OBSERVED_AT.toISOString(),
    expiresAt: VALID_UNTIL.toISOString(),
    profile: "beta-d-0.2" as const,
    scope: `audit:${resource}`,
    evidence,
    kid: JWT_KID,
  };
  return { ...unsigned, attestation: attestationFor(unsigned) };
}

function repository(
  overrides: Partial<AuditEvidenceRepository> = {},
): AuditEvidenceRepository {
  const evidence = [{ metric: "performance", value: 0.9 }];
  return {
    findLatestEvidence: async () => ({
      resource: "quality",
      observedAt: OBSERVED_AT,
      validUntil: VALID_UNTIL,
      environment: "production",
      jwtKid: JWT_KID,
      cardinality: 1,
      evidence,
      attestation: evidenceEnvelope("quality", evidence).attestation,
    }),
    findLatestReleaseAttestation: async () => null,
    ...overrides,
  };
}

function manifest() {
  const deployment = {
    deploymentSha: "a".repeat(40),
    images: {
      api: "sha256:" + "a".repeat(64),
      web: "sha256:" + "b".repeat(64),
      database: "sha256:" + "c".repeat(64),
      proxy: "sha256:" + "d".repeat(64),
    },
  };
  const dependencies = {
    packageCount: 10,
    highRiskCount: 0,
    criticalRiskCount: 0,
  };
  const deploymentDigest = "sha256:" + "e".repeat(64);
  return {
    schemaVersion: "beta-d-0.2",
    environment: "production",
    deploymentSha: "a".repeat(40),
    observedAt: OBSERVED_AT.toISOString(),
    validUntil: VALID_UNTIL.toISOString(),
    deployment,
    deploymentDigest,
    dependencies,
    audit: {
      envelopes: {
        deployment: evidenceEnvelope("deployment", deployment),
        dependencies: evidenceEnvelope("dependencies", dependencies),
      },
    },
  };
}

function signedManifest(value: Record<string, unknown>): string {
  return sign(null, Buffer.from(stableJson(value)), privateKey).toString(
    "base64url",
  );
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
  it("returns the exact beta-d-0.2 envelope for internal evidence", async () => {
    configure();
    const service = new AuditService(repository(), () => NOW);

    const result = await service.read("quality", identity);
    expect(Object.keys(result).sort()).toEqual([
      "attestation",
      "environment",
      "evidence",
      "expiresAt",
      "generatedAt",
      "hostname",
      "kid",
      "profile",
      "scope",
    ]);
    expect(result).toMatchObject({
      hostname: "grumphya.com",
      environment: "production",
      profile: "beta-d-0.2",
      scope: "audit:quality",
      kid: JWT_KID,
      evidence: [{ metric: "performance", value: 0.9 }],
      attestation: { alg: "EdDSA", kid: RELEASE_KID },
    });
  });

  it("rejects expired evidence", async () => {
    configure();
    const service = new AuditService(
      repository({
        findLatestEvidence: async () => ({
          resource: "privacy",
          observedAt: new Date("2026-11-16T19:00:00.000Z"),
          validUntil: new Date("2026-11-17T19:00:00.000Z"),
          environment: "production",
          jwtKid: JWT_KID,
          cardinality: 1,
          evidence: [{ policy: "expired" }],
          attestation: evidenceEnvelope("privacy", [{ policy: "expired" }])
            .attestation,
        }),
      }),
      () => NOW,
    );

    await expect(service.read("privacy", identity)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("requires a valid Ed25519 release attestation for deployment data", async () => {
    configure();
    const value = manifest();
    const service = new AuditService(
      repository({
        findLatestReleaseAttestation: async () => ({
          manifest: value,
          signature: signedManifest(value),
          kid: RELEASE_KID,
          observedAt: OBSERVED_AT,
          validUntil: VALID_UNTIL,
        }),
      }),
      () => NOW,
    );

    await expect(service.read("deployment", identity)).resolves.toMatchObject({
      hostname: "grumphya.com",
      scope: "audit:deployment",
      evidence: value.deployment,
      attestation: { kid: RELEASE_KID },
      kid: JWT_KID,
    });
    await expect(service.read("dependencies", identity)).resolves.toMatchObject(
      {
        scope: "audit:dependencies",
        evidence: value.dependencies,
      },
    );
  });

  it("rejects an invalid release signature", async () => {
    configure();
    const value = manifest();
    const altered = { ...value, environment: "staging" };
    const service = new AuditService(
      repository({
        findLatestReleaseAttestation: async () => ({
          manifest: value,
          signature: signedManifest(altered),
          kid: RELEASE_KID,
          observedAt: OBSERVED_AT,
          validUntil: VALID_UNTIL,
        }),
      }),
      () => NOW,
    );

    await expect(service.read("deployment", identity)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("rejects an evidence record signed for a different JWT kid", async () => {
    configure();
    const service = new AuditService(
      repository({
        findLatestEvidence: async () => ({
          resource: "quality",
          observedAt: OBSERVED_AT,
          validUntil: VALID_UNTIL,
          environment: "production",
          jwtKid: "rotated-kid",
          cardinality: 1,
          evidence: [{ metric: "performance" }],
          attestation: evidenceEnvelope("quality", [{ metric: "performance" }])
            .attestation,
        }),
      }),
      () => NOW,
    );

    await expect(service.read("quality", identity)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("rejects evidence with more than one result", async () => {
    configure();
    const evidence = [{ metric: "first" }, { metric: "second" }];
    const service = new AuditService(
      repository({
        findLatestEvidence: async () => ({
          resource: "quality",
          observedAt: OBSERVED_AT,
          validUntil: VALID_UNTIL,
          environment: "production",
          jwtKid: JWT_KID,
          cardinality: 2,
          evidence,
          attestation: evidenceEnvelope("quality", evidence).attestation,
        }),
      }),
      () => NOW,
    );

    await expect(service.read("quality", identity)).rejects.toMatchObject({
      status: 503,
    });
  });
});
