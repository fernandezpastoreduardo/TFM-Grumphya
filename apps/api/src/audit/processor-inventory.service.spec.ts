import {
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditHttpException } from "./audit-errors";
import { canonicalJson, emptyAuditEvidence } from "./audit-signals";
import { verifiedCurrentReleaseDigest } from "./audit.service";
import type { AuditTechnicalIdentity } from "./audit-technical-auth";
import { ProcessorInventoryService } from "./processor-inventory.service";
import type {
  ProcessorInventorySourceResult,
  ProcessorInventoryUnsigned,
} from "./processor-inventory.models";
import type { ReleaseAttestationRecord } from "./audit.models";

const NOW = new Date("2026-11-22T10:00:00.000Z");
const RELEASE_DIGEST = `sha256:${"a".repeat(64)}`;
const RELEASE_KID = "grumphya-release-2026";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PRIVATE_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const IDENTITY: AuditTechnicalIdentity = {
  issuer: "desarrolloseguro-audit",
  subject: "desarrolloseguro-audit",
  audience: "grumphya-audit",
  environment: "production",
  domain: "grumphya.com",
  hostname: "grumphya.com",
  scopes: new Set(["audit:privacy"]),
  issuedAt: 1_795_000_000,
  expiresAt: 1_795_000_240,
  jti: "processor-reader",
  kid: "ds-auditor-2026",
};
const EMPTY_COMPLETE_INVENTORY: ProcessorInventorySourceResult = {
  inventoryStatus: "complete",
  processors: [],
};
const INCOMPLETE_MISSING_INVENTORY: ProcessorInventorySourceResult = {
  inventoryStatus: "incomplete",
  processors: [
    {
      providerId: "new-provider",
      displayName: "Nuevo proveedor",
      product: "Servicio configurado",
      disclosureStatus: "missing",
    },
  ],
};
const ENVIRONMENT_KEYS = [
  "AUDIT_RELEASE_SIGNING_PRIVATE_KEY",
  "AUDIT_RELEASE_SIGNING_PRIVATE_KEY_FILE",
  "AUDIT_RELEASE_MANIFEST_PUBLIC_KEY",
  "AUDIT_RELEASE_MANIFEST_PUBLIC_KEY_FILE",
  "AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS",
  "DEPLOY_SHA",
] as const;

function configureSigning(): void {
  process.env.AUDIT_RELEASE_SIGNING_PRIVATE_KEY = PRIVATE_PEM;
  process.env.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY = PUBLIC_PEM;
  process.env.AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS = RELEASE_KID;
}

function service(
  source: () => ProcessorInventorySourceResult,
  digest = RELEASE_DIGEST,
) {
  return new ProcessorInventoryService(
    { readCurrentReleaseDigest: async () => digest } as never,
    () => new Date(NOW),
    source,
  );
}

function unsignedResponse(
  response: Awaited<ReturnType<ProcessorInventoryService["read"]>>,
): ProcessorInventoryUnsigned {
  const unsigned: Record<string, unknown> = { ...response };
  delete unsigned.attestation;
  return unsigned as ProcessorInventoryUnsigned;
}

function assertSignatureIsValid(
  response: Awaited<ReturnType<ProcessorInventoryService["read"]>>,
): void {
  const unsigned = unsignedResponse(response);
  expect(
    verify(
      null,
      Buffer.from(canonicalJson(unsigned), "utf8"),
      createPublicKey(PUBLIC_PEM),
      Buffer.from(response.attestation.signature, "base64url"),
    ),
  ).toBe(true);
}

function signedReleaseRecord(): ReleaseAttestationRecord {
  const observedAt = new Date(NOW.getTime() - 60 * 60 * 1000);
  const validUntil = new Date(observedAt.getTime() + 24 * 60 * 60 * 1000);
  const deploymentDigest = RELEASE_DIGEST;
  const envelope = () => {
    const unsigned = {
      schemaVersion: "beta-d-0.2",
      observedAt: observedAt.toISOString(),
      validUntil: validUntil.toISOString(),
      environment: "production",
      deploymentDigest,
      cardinality: 1,
      evidence: emptyAuditEvidence(observedAt),
    };
    return {
      ...unsigned,
      attestation: {
        alg: "EdDSA",
        kid: RELEASE_KID,
        signature: sign(
          null,
          Buffer.from(canonicalJson(unsigned)),
          privateKey,
        ).toString("base64url"),
      },
    };
  };
  const unsignedManifest = {
    schemaVersion: "beta-d-0.2",
    environment: "production",
    observedAt: observedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    deployment: {
      deploymentSha: "c".repeat(40),
      images: {
        api: `sha256:${"1".repeat(64)}`,
        web: `sha256:${"2".repeat(64)}`,
        database: `sha256:${"3".repeat(64)}`,
        proxy: `sha256:${"4".repeat(64)}`,
      },
    },
    deploymentDigest,
    dependencies: { dependencyInventoryDigest: "d".repeat(64) },
    audit: {
      envelopes: {
        deployment: envelope(),
        dependencies: envelope(),
      },
    },
  };
  const manifestSignature = sign(
    null,
    Buffer.from(canonicalJson(unsignedManifest)),
    privateKey,
  ).toString("base64url");
  return {
    manifest: unsignedManifest,
    signature: manifestSignature,
    kid: RELEASE_KID,
    observedAt,
    validUntil,
  };
}

afterEach(() => {
  for (const key of ENVIRONMENT_KEYS) delete process.env[key];
});

describe("ProcessorInventoryService", () => {
  it("returns an exactly versioned, signed complete empty production inventory", async () => {
    configureSigning();
    const result = await service(() => EMPTY_COMPLETE_INVENTORY).read(IDENTITY);

    expect(Object.keys(result).sort()).toEqual(
      [
        "schemaVersion",
        "observedAt",
        "validUntil",
        "environment",
        "hostname",
        "deploymentDigest",
        "inventoryStatus",
        "privacyPolicy",
        "processors",
        "attestation",
      ].sort(),
    );
    expect(result).toMatchObject({
      schemaVersion: "processor-inventory-v1",
      observedAt: NOW.toISOString(),
      validUntil: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      environment: "production",
      hostname: "grumphya.com",
      deploymentDigest: RELEASE_DIGEST,
      inventoryStatus: "complete",
      privacyPolicy: {
        url: "https://grumphya.com/politica-de-privacidad",
        revision: "v5",
      },
      processors: [],
      attestation: { alg: "EdDSA", kid: RELEASE_KID },
    });
    assertSignatureIsValid(result);
  });

  it("returns an incomplete inventory as a signed transparency result without blaming the reader", async () => {
    configureSigning();
    const result = await service(() => INCOMPLETE_MISSING_INVENTORY).read(
      IDENTITY,
    );

    expect(result.inventoryStatus).toBe("incomplete");
    expect(result.processors).toEqual([
      {
        providerId: "new-provider",
        displayName: "Nuevo proveedor",
        product: "Servicio configurado",
        disclosureStatus: "missing",
      },
    ]);
    expect(result.processors[0]).not.toHaveProperty("purpose");
    expect(result.processors[0]).not.toHaveProperty("policyUrl");
    expect(result.processors[0]).not.toHaveProperty("declaredStatements");
    assertSignatureIsValid(result);
  });

  it("returns a safe read error when private inventory inspection fails", async () => {
    configureSigning();
    const result = service(() => {
      throw new Error("private inspection details");
    });

    await expect(result.read(IDENTITY)).rejects.toMatchObject({
      status: 503,
      code: "evidence_unavailable",
      response: {
        message: "El inventario de proveedores no está disponible.",
      },
    });
  });

  it.each([
    ["scope", { ...IDENTITY, scopes: new Set(["audit:quality"]) }],
    ["hostname", { ...IDENTITY, hostname: "example.com" }],
    ["issuer", { ...IDENTITY, issuer: "other" }],
  ])(
    "refuses to read before an invalid %s identity",
    async (_name, identity) => {
      configureSigning();
      const source = vi.fn(() => EMPTY_COMPLETE_INVENTORY);
      await expect(service(source).read(identity)).rejects.toBeInstanceOf(
        AuditHttpException,
      );
      expect(source).not.toHaveBeenCalled();
    },
  );

  it("uses the verified current release digest and rejects malformed inventories", async () => {
    configureSigning();
    const digestRead = vi
      .fn()
      .mockRejectedValue(
        new AuditHttpException(503, "evidence_unavailable", "safe"),
      );
    const noRelease = new ProcessorInventoryService(
      { readCurrentReleaseDigest: digestRead } as never,
      () => new Date(NOW),
      () => EMPTY_COMPLETE_INVENTORY,
    );
    await expect(noRelease.read(IDENTITY)).rejects.toBeInstanceOf(
      AuditHttpException,
    );

    const invalidSource = {
      ...EMPTY_COMPLETE_INVENTORY,
      processors: [
        INCOMPLETE_MISSING_INVENTORY.processors[0],
        INCOMPLETE_MISSING_INVENTORY.processors[0],
      ],
    } as ProcessorInventorySourceResult;
    await expect(
      service(() => invalidSource).read(IDENTITY),
    ).rejects.toMatchObject({
      status: 503,
      code: "evidence_unavailable",
    });
  });

  it("detects tampering with the signed digest", async () => {
    configureSigning();
    const result = await service(() => EMPTY_COMPLETE_INVENTORY).read(IDENTITY);
    const tampered = {
      ...result,
      deploymentDigest: `sha256:${"b".repeat(64)}`,
    };
    const unsigned = unsignedResponse(tampered);

    expect(
      verify(
        null,
        Buffer.from(canonicalJson(unsigned), "utf8"),
        createPublicKey(PUBLIC_PEM),
        Buffer.from(result.attestation.signature, "base64url"),
      ),
    ).toBe(false);
  });

  it("binds the reported digest to the current valid signed release", () => {
    configureSigning();
    process.env.DEPLOY_SHA = "c".repeat(40);
    const record = signedReleaseRecord();

    expect(verifiedCurrentReleaseDigest(record, NOW)).toBe(RELEASE_DIGEST);
    const tampered = {
      ...record,
      manifest: {
        ...record.manifest,
        deploymentDigest: `sha256:${"b".repeat(64)}`,
      },
    };
    expect(verifiedCurrentReleaseDigest(tampered, NOW)).toBeUndefined();

    process.env.DEPLOY_SHA = "e".repeat(40);
    expect(verifiedCurrentReleaseDigest(record, NOW)).toBeUndefined();
  });
});
