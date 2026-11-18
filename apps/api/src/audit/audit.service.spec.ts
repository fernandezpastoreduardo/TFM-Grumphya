import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { AuditEvidenceRepository } from "./audit.models";
import { AuditService } from "./audit.service";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
const NOW = new Date("2026-11-18T20:00:00.000Z");
const OBSERVED_AT = new Date("2026-11-18T19:00:00.000Z");
const VALID_UNTIL = new Date("2026-11-19T19:00:00.000Z");

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function repository(
  overrides: Partial<AuditEvidenceRepository> = {},
): AuditEvidenceRepository {
  return {
    findLatestEvidence: async () => ({
      resource: "quality",
      observedAt: OBSERVED_AT,
      validUntil: VALID_UNTIL,
      items: [{ metric: "performance", value: 0.9 }],
    }),
    findLatestReleaseAttestation: async () => null,
    ...overrides,
  };
}

function manifest() {
  return {
    schemaVersion: "beta-d-0.2",
    environment: "production",
    deployment: {
      deploymentSha: "a".repeat(40),
      images: {
        api: "sha256:" + "a".repeat(64),
        web: "sha256:" + "b".repeat(64),
        database: "sha256:" + "c".repeat(64),
        proxy: "sha256:" + "d".repeat(64),
      },
    },
    dependencies: {
      packageCount: 10,
      highRiskCount: 0,
      criticalRiskCount: 0,
    },
  };
}

function signedManifest(value: Record<string, unknown>): string {
  return sign(null, Buffer.from(stableJson(value)), privateKey).toString(
    "base64url",
  );
}

afterEach(() => {
  delete process.env.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY;
  delete process.env.DEPLOY_SHA;
});

describe("AuditService", () => {
  it("returns a versioned envelope from precomputed evidence", async () => {
    const service = new AuditService(repository(), () => NOW);

    await expect(service.read("quality")).resolves.toEqual({
      schemaVersion: "beta-d-0.2",
      observedAt: OBSERVED_AT.toISOString(),
      validUntil: VALID_UNTIL.toISOString(),
      items: [{ metric: "performance", value: 0.9 }],
    });
  });

  it("rejects expired evidence", async () => {
    const service = new AuditService(
      repository({
        findLatestEvidence: async () => ({
          resource: "privacy",
          observedAt: new Date("2026-11-16T19:00:00.000Z"),
          validUntil: new Date("2026-11-17T19:00:00.000Z"),
          items: [],
        }),
      }),
      () => NOW,
    );

    await expect(service.read("privacy")).rejects.toMatchObject({
      status: 503,
    });
  });

  it("requires a valid Ed25519 release attestation for deployment data", async () => {
    const value = manifest();
    process.env.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY = PUBLIC_KEY;
    process.env.DEPLOY_SHA = "a".repeat(40);
    const service = new AuditService(
      repository({
        findLatestReleaseAttestation: async () => ({
          manifest: value,
          signature: signedManifest(value),
          observedAt: OBSERVED_AT,
          validUntil: VALID_UNTIL,
        }),
      }),
      () => NOW,
    );

    await expect(service.read("deployment")).resolves.toMatchObject({
      schemaVersion: "beta-d-0.2",
      items: [value.deployment],
    });
    await expect(service.read("dependencies")).resolves.toMatchObject({
      items: [value.dependencies],
    });
  });

  it("rejects an invalid release signature", async () => {
    const value = manifest();
    process.env.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY = PUBLIC_KEY;
    process.env.DEPLOY_SHA = "a".repeat(40);
    const service = new AuditService(
      repository({
        findLatestReleaseAttestation: async () => ({
          manifest: value,
          signature: signedManifest({ ...value, environment: "staging" }),
          observedAt: OBSERVED_AT,
          validUntil: VALID_UNTIL,
        }),
      }),
      () => NOW,
    );

    await expect(service.read("deployment")).rejects.toMatchObject({
      status: 503,
    });
  });
});
