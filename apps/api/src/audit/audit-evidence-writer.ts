import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import {
  AUDIT_ATTESTATION_ALGORITHM,
  AUDIT_ENVIRONMENT,
  AUDIT_RESOURCES,
  AUDIT_SCHEMA_VERSION,
  type AuditResource,
} from "./audit.models";
import {
  canonicalJson,
  parseAuditEvidence,
  type AuditEvidence,
} from "./audit-signals";

const RELEASE_ATTESTATION_KID = "grumphya-release-2026" as const;
const JWT_KID = "ds-auditor-2026" as const;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const PUBLIC_KEY_PATTERN = /BEGIN PUBLIC KEY/iu;
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const ENVELOPE_KEYS = [
  "schemaVersion",
  "observedAt",
  "validUntil",
  "environment",
  "deploymentDigest",
  "cardinality",
  "evidence",
  "attestation",
] as const;

export type ReleaseManifestEnvelope = {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  observedAt: string;
  validUntil: string;
  environment: typeof AUDIT_ENVIRONMENT;
  deploymentDigest: string;
  cardinality: 1;
  evidence: AuditEvidence;
  attestation: {
    alg: typeof AUDIT_ATTESTATION_ALGORITHM;
    kid: typeof RELEASE_ATTESTATION_KID;
    signature: string;
  };
};
export type VerifiedReleaseManifest = {
  deploymentSha: string;
  deploymentDigest: string;
  observedAt: Date;
  validUntil: Date;
  manifest: Record<string, unknown>;
  signature: string;
  envelopes: Record<AuditResource, ReleaseManifestEnvelope>;
};

export function stableJson(value: unknown): string {
  return canonicalJson(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : undefined;
}
function verifySignature(
  value: unknown,
  signature: string,
  publicKeyPem: string,
): boolean {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    return (
      publicKey.asymmetricKeyType === "ed25519" &&
      verify(
        null,
        Buffer.from(stableJson(value), "utf8"),
        publicKey,
        Buffer.from(signature, "base64url"),
      )
    );
  } catch {
    return false;
  }
}
function readEnvelope(
  value: unknown,
  resource: AuditResource,
  publicKeyPem: string,
): ReleaseManifestEnvelope | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== ENVELOPE_KEYS.length ||
    !ENVELOPE_KEYS.every((key) => key in value)
  )
    return undefined;
  if (
    value.schemaVersion !== AUDIT_SCHEMA_VERSION ||
    value.environment !== AUDIT_ENVIRONMENT ||
    value.cardinality !== 1 ||
    typeof value.observedAt !== "string" ||
    typeof value.validUntil !== "string" ||
    typeof value.deploymentDigest !== "string" ||
    !DIGEST_PATTERN.test(value.deploymentDigest)
  )
    return undefined;
  const observedAt = parseDate(value.observedAt);
  const validUntil = parseDate(value.validUntil);
  const attestation = value.attestation;
  if (
    !observedAt ||
    !validUntil ||
    validUntil.getTime() - observedAt.getTime() > MAX_EVIDENCE_AGE_MS ||
    !isRecord(attestation) ||
    attestation.alg !== AUDIT_ATTESTATION_ALGORITHM ||
    attestation.kid !== RELEASE_ATTESTATION_KID ||
    typeof attestation.signature !== "string" ||
    !attestation.signature
  )
    return undefined;
  let evidence: AuditEvidence;
  try {
    evidence = parseAuditEvidence(value.evidence, resource);
  } catch {
    return undefined;
  }
  if (evidence.observedAt !== observedAt.toISOString()) return undefined;
  const unsigned = {
    schemaVersion: value.schemaVersion,
    observedAt: value.observedAt,
    validUntil: value.validUntil,
    environment: value.environment,
    deploymentDigest: value.deploymentDigest,
    cardinality: value.cardinality,
    evidence: value.evidence,
  };
  if (!verifySignature(unsigned, attestation.signature, publicKeyPem))
    return undefined;
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    observedAt: observedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    environment: AUDIT_ENVIRONMENT,
    deploymentDigest: value.deploymentDigest,
    cardinality: 1,
    evidence,
    attestation: {
      alg: AUDIT_ATTESTATION_ALGORITHM,
      kid: RELEASE_ATTESTATION_KID,
      signature: attestation.signature,
    },
  };
}
function readRequiredRecord(
  manifest: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = manifest[key];
  return isRecord(value) ? value : undefined;
}
export function verifyReleaseManifest(
  manifestText: string,
  signature: string,
  publicKeyPem: string,
  now = new Date(),
): VerifiedReleaseManifest {
  if (!PUBLIC_KEY_PATTERN.test(publicKeyPem))
    throw new Error("Audit manifest public key is not configured.");
  const manifestValue: unknown = JSON.parse(manifestText);
  if (!isRecord(manifestValue))
    throw new Error("Audit release manifest must be an object.");
  if (!verifySignature(manifestValue, signature, publicKeyPem))
    throw new Error("Audit release manifest signature is invalid.");
  if (
    manifestValue.schemaVersion !== AUDIT_SCHEMA_VERSION ||
    manifestValue.environment !== AUDIT_ENVIRONMENT
  )
    throw new Error("Audit release manifest has an unsupported contract.");
  const deployment = readRequiredRecord(manifestValue, "deployment");
  const deploymentSha = deployment?.deploymentSha;
  const deploymentDigest = manifestValue.deploymentDigest;
  const observedAt = parseDate(manifestValue.observedAt);
  const validUntil = parseDate(manifestValue.validUntil);
  if (
    typeof deploymentSha !== "string" ||
    !SHA_PATTERN.test(deploymentSha) ||
    typeof deploymentDigest !== "string" ||
    !DIGEST_PATTERN.test(deploymentDigest) ||
    !observedAt ||
    !validUntil ||
    validUntil.getTime() - observedAt.getTime() > MAX_EVIDENCE_AGE_MS ||
    observedAt.getTime() > now.getTime() ||
    validUntil.getTime() <= now.getTime()
  )
    throw new Error("Audit release manifest dates or digest are invalid.");
  const imageValues = deployment
    ? readRequiredRecord(deployment, "images")
    : undefined;
  if (
    !imageValues ||
    Object.keys(imageValues).length !== 4 ||
    !Object.values(imageValues).every(
      (value) => typeof value === "string" && DIGEST_PATTERN.test(value),
    )
  )
    throw new Error("Audit release manifest image digests are invalid.");
  const dependencies = readRequiredRecord(manifestValue, "dependencies");
  if (
    !dependencies ||
    typeof dependencies.dependencyInventoryDigest !== "string" ||
    !/^[0-9a-f]{64}$/u.test(dependencies.dependencyInventoryDigest)
  )
    throw new Error("Audit dependency inventory digest is invalid.");
  const audit = readRequiredRecord(manifestValue, "audit");
  const envelopeValues = readRequiredRecord(audit ?? {}, "envelopes");
  const envelopes = {} as Record<AuditResource, ReleaseManifestEnvelope>;
  for (const resource of AUDIT_RESOURCES) {
    const envelope = readEnvelope(
      envelopeValues?.[resource],
      resource,
      publicKeyPem,
    );
    if (!envelope || envelope.deploymentDigest !== deploymentDigest)
      throw new Error("Audit envelope is invalid for " + resource + ".");
    const envelopeObservedAt = parseDate(envelope.observedAt);
    const envelopeValidUntil = parseDate(envelope.validUntil);
    if (
      !envelopeObservedAt ||
      !envelopeValidUntil ||
      envelopeObservedAt.getTime() > now.getTime() ||
      envelopeValidUntil.getTime() <= now.getTime()
    )
      throw new Error("Audit envelope is expired for " + resource + ".");
    envelopes[resource] = envelope;
  }
  return {
    deploymentSha,
    deploymentDigest,
    observedAt,
    validUntil,
    manifest: manifestValue,
    signature,
    envelopes,
  };
}
export function buildAuditEvidenceRows(
  release: VerifiedReleaseManifest,
): Array<{
  resource: AuditResource;
  observedAt: Date;
  validUntil: Date;
  environment: typeof AUDIT_ENVIRONMENT;
  deploymentDigest: string;
  cardinality: 1;
  jwtKid: typeof JWT_KID;
  evidence: AuditEvidence;
  attestation: ReleaseManifestEnvelope["attestation"];
}> {
  return AUDIT_RESOURCES.filter(
    (resource) => resource !== "deployment" && resource !== "dependencies",
  ).map((resource) => {
    const envelope = release.envelopes[resource];
    return {
      resource,
      observedAt: new Date(envelope.observedAt),
      validUntil: new Date(envelope.validUntil),
      environment: AUDIT_ENVIRONMENT,
      deploymentDigest: release.deploymentDigest,
      cardinality: 1,
      jwtKid: JWT_KID,
      evidence: envelope.evidence,
      attestation: envelope.attestation,
    };
  });
}
export function assertNoDuplicateReleaseAttestation(rowCount: number): void {
  if (rowCount > 0) throw new Error("Duplicate audit release attestation.");
}
function isUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}
async function readSettings(path: string): Promise<Record<string, string>> {
  const text = await readFile(path, "utf8");
  const settings: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    settings[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return settings;
}
function requiredSetting(
  settings: Record<string, string>,
  name: string,
): string {
  const value = settings[name]?.trim();
  if (!value) throw new Error("Missing audit writer setting: " + name + ".");
  return value.replace(/\\n/gu, "\n");
}
async function main(): Promise<void> {
  const manifestPath = process.env.AUDIT_MANIFEST_FILE;
  const signaturePath = process.env.AUDIT_MANIFEST_SIGNATURE_FILE;
  const settingsPath =
    process.env.AUDIT_WRITER_SETTINGS_FILE ??
    "/run/secrets/audit_writer_settings";
  if (!manifestPath || !signaturePath)
    throw new Error("Audit manifest paths are not configured.");
  const settings = await readSettings(settingsPath);
  process.env.PGDATABASE = requiredSetting(settings, "PGDATABASE");
  process.env.PGUSER = requiredSetting(settings, "PGUSER");
  process.env.PGPASSWORD = requiredSetting(settings, "PGPASSWORD");
  const publicKey = requiredSetting(
    settings,
    "AUDIT_RELEASE_MANIFEST_PUBLIC_KEY",
  );
  const allowedKids = requiredSetting(
    settings,
    "AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS",
  )
    .split(",")
    .map((value) => value.trim());
  if (!allowedKids.includes(RELEASE_ATTESTATION_KID))
    throw new Error("Audit release attestation kid is not allowlisted.");
  const release = verifyReleaseManifest(
    await readFile(manifestPath, "utf8"),
    (await readFile(signaturePath, "utf8")).trim(),
    publicKey,
  );
  const pool = createPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(
        "INSERT INTO audit.release_attestations (deployment_sha, environment, manifest, signature, kid, observed_at, valid_until) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)",
        [
          release.deploymentSha,
          AUDIT_ENVIRONMENT,
          JSON.stringify(release.manifest),
          release.signature,
          RELEASE_ATTESTATION_KID,
          release.observedAt,
          release.validUntil,
        ],
      );
    } catch (error: unknown) {
      if (isUniqueViolation(error)) assertNoDuplicateReleaseAttestation(1);
      throw error;
    }
    for (const row of buildAuditEvidenceRows(release)) {
      await client.query(
        "SELECT audit.upsert_evidence($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)",
        [
          row.resource,
          row.observedAt,
          row.validUntil,
          row.environment,
          row.deploymentDigest,
          row.cardinality,
          row.jwtKid,
          JSON.stringify(row.evidence),
          JSON.stringify(row.attestation),
        ],
      );
    }
    await client.query("COMMIT");
    process.stdout.write(
      "Persisted audit evidence for " +
        release.deploymentSha +
        " (" +
        AUDIT_RESOURCES.length +
        " resources).\\n",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
if (process.argv[1]?.endsWith("audit-evidence-writer.js"))
  main().catch((error: unknown) => {
    process.stderr.write(
      (error instanceof Error ? error.message : "Audit writer failed.") + "\\n",
    );
    process.exitCode = 1;
  });
