import { describe, expect, it, vi } from "vitest";
import { PostgresAuditEvidenceRepository } from "./postgres-audit-evidence.repository";

const RELEASE_ATTESTATION = {
  manifest: { deploymentDigest: `sha256:${"a".repeat(64)}` },
  signature: "signature",
  kid: "grumphya-release-2026",
  observed_at: new Date("2026-11-24T12:00:00.000Z"),
  valid_until: new Date("2026-11-25T12:00:00.000Z"),
};

describe("PostgresAuditEvidenceRepository release attestation reader", () => {
  it("reads the newest persisted production release attestation and maps its fields", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [RELEASE_ATTESTATION] });
    const repository = new PostgresAuditEvidenceRepository({ query } as never);

    await expect(repository.findLatestReleaseAttestation()).resolves.toEqual({
      manifest: RELEASE_ATTESTATION.manifest,
      signature: RELEASE_ATTESTATION.signature,
      kid: RELEASE_ATTESTATION.kid,
      observedAt: RELEASE_ATTESTATION.observed_at,
      validUntil: RELEASE_ATTESTATION.valid_until,
    });

    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toMatch(/FROM audit\.release_attestations/u);
    expect(sql).toMatch(/WHERE environment = 'production'/u);
    expect(sql).toMatch(/ORDER BY observed_at DESC/u);
    expect(sql).toMatch(/LIMIT 1/u);
    expect(query.mock.calls[0]).toHaveLength(1);
  });

  it.each([
    ["no persisted release", []],
    ["null manifest", [{ ...RELEASE_ATTESTATION, manifest: null }]],
    ["invalid manifest shape", [{ ...RELEASE_ATTESTATION, manifest: "bad" }]],
  ])("returns no release for %s", async (_name, rows) => {
    const query = vi.fn().mockResolvedValue({ rows });
    const repository = new PostgresAuditEvidenceRepository({ query } as never);

    await expect(repository.findLatestReleaseAttestation()).resolves.toBeNull();
  });
});
