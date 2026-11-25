import { Inject, Injectable } from "@nestjs/common";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { auditError } from "./audit-errors";
import { assertAuditResponseSize } from "./audit-request-policy";
import { canonicalJson, parseAuditEvidence } from "./audit-signals";
import {
  AUDIT_ATTESTATION_ALGORITHM,
  AUDIT_CLOCK,
  AUDIT_ENVIRONMENT,
  AUDIT_EVIDENCE_REPOSITORY,
  AUDIT_SCHEMA_VERSION,
  type AuditAttestation,
  type AuditEnvelope,
  type AuditEvidenceRecord,
  type AuditEvidenceRepository,
  type AuditResource,
  type ReleaseAttestationRecord,
} from "./audit.models";
import type { AuditTechnicalIdentity } from "./audit-technical-auth";

const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_QUERY_TIME_MS = 5_000;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RELEASE_ATTESTATION_KID = "grumphya-release-2026" as const;
const IMAGE_NAMES = ["api", "web", "database", "proxy"] as const;
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
const ATTESTATION_KEYS = ["alg", "kid", "signature"] as const;

function readManifestPublicKey(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const inline = environment.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY?.trim();
  if (inline) return inline.replace(/\\n/gu, "\n");
  const file = environment.AUDIT_RELEASE_MANIFEST_PUBLIC_KEY_FILE?.trim();
  if (!file) return undefined;
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}
function readAllowedManifestKids(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  return (environment.AUDIT_RELEASE_MANIFEST_ALLOWED_KIDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time) : undefined;
}
function validateFreshness(
  observedAt: Date,
  validUntil: Date,
  now: Date,
): void {
  if (
    !Number.isFinite(observedAt.getTime()) ||
    !Number.isFinite(validUntil.getTime()) ||
    validUntil.getTime() <= now.getTime() ||
    observedAt.getTime() > now.getTime() + 30_000 ||
    now.getTime() - observedAt.getTime() > MAX_EVIDENCE_AGE_MS ||
    validUntil.getTime() - observedAt.getTime() > MAX_EVIDENCE_AGE_MS
  ) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría no es válida o ha caducado.",
    );
  }
}
function readAttestation(value: unknown): AuditAttestation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== ATTESTATION_KEYS.length ||
    !ATTESTATION_KEYS.every((key) => key in record) ||
    record.alg !== AUDIT_ATTESTATION_ALGORITHM ||
    typeof record.kid !== "string" ||
    record.kid.length === 0 ||
    typeof record.signature !== "string" ||
    !/^[A-Za-z0-9_-]+$/u.test(record.signature)
  )
    return undefined;
  return {
    alg: AUDIT_ATTESTATION_ALGORITHM,
    kid: record.kid,
    signature: record.signature,
  };
}
function verifyEnvelopeAttestation(
  unsigned: Omit<AuditEnvelope, "attestation">,
  attestation: AuditAttestation,
): boolean {
  const publicKeyPem = readManifestPublicKey();
  if (!publicKeyPem || !readAllowedManifestKids().includes(attestation.kid))
    return false;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    return (
      publicKey.asymmetricKeyType === "ed25519" &&
      verify(
        null,
        Buffer.from(canonicalJson(unsigned), "utf8"),
        publicKey,
        Buffer.from(attestation.signature, "base64url"),
      )
    );
  } catch {
    return false;
  }
}
function parseEnvelope(
  value: unknown,
  resource: AuditResource,
): AuditEnvelope | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== ENVELOPE_KEYS.length ||
    !ENVELOPE_KEYS.every((key) => key in record) ||
    record.schemaVersion !== AUDIT_SCHEMA_VERSION ||
    record.environment !== AUDIT_ENVIRONMENT ||
    record.cardinality !== 1 ||
    typeof record.deploymentDigest !== "string" ||
    !DIGEST_PATTERN.test(record.deploymentDigest)
  )
    return undefined;
  const observedAt = parseDate(record.observedAt);
  const validUntil = parseDate(record.validUntil);
  const attestation = readAttestation(record.attestation);
  if (!observedAt || !validUntil || !attestation) return undefined;
  let evidence;
  try {
    evidence = parseAuditEvidence(record.evidence, resource);
  } catch {
    return undefined;
  }
  if (evidence.observedAt !== observedAt.toISOString()) return undefined;
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    observedAt: observedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    environment: AUDIT_ENVIRONMENT,
    deploymentDigest: record.deploymentDigest as string,
    cardinality: 1,
    evidence,
    attestation,
  };
}
function manifestEnvelope(
  manifest: Record<string, unknown>,
  resource: AuditResource,
): unknown {
  const audit = manifest.audit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit))
    return undefined;
  const envelopes = (audit as Record<string, unknown>).envelopes;
  return envelopes && typeof envelopes === "object" && !Array.isArray(envelopes)
    ? (envelopes as Record<string, unknown>)[resource]
    : undefined;
}
function isProductionManifest(manifest: Record<string, unknown>): boolean {
  const deployment = manifest.deployment;
  const deploymentDigest = manifest.deploymentDigest;
  if (
    !deployment ||
    typeof deployment !== "object" ||
    Array.isArray(deployment) ||
    typeof deploymentDigest !== "string" ||
    !DIGEST_PATTERN.test(deploymentDigest)
  )
    return false;
  const record = deployment as Record<string, unknown>;
  const images = record.images;
  return (
    typeof record.deploymentSha === "string" &&
    /^[0-9a-f]{40}$/u.test(record.deploymentSha) &&
    images !== null &&
    typeof images === "object" &&
    !Array.isArray(images) &&
    Object.keys(images).length === IMAGE_NAMES.length &&
    IMAGE_NAMES.every(
      (name) =>
        typeof (images as Record<string, unknown>)[name] === "string" &&
        DIGEST_PATTERN.test(
          (images as Record<string, unknown>)[name] as string,
        ),
    ) &&
    record.deploymentSha === process.env.DEPLOY_SHA
  );
}
function signedManifestIsValid(
  attestation: ReleaseAttestationRecord,
  now: Date,
  allowExpired = false,
): boolean {
  const publicKeyPem = readManifestPublicKey();
  if (
    !publicKeyPem ||
    !readAllowedManifestKids().includes(attestation.kid) ||
    attestation.kid !== RELEASE_ATTESTATION_KID
  )
    return false;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const signatureValid = verify(
      null,
      Buffer.from(canonicalJson(attestation.manifest), "utf8"),
      publicKey,
      Buffer.from(attestation.signature, "base64url"),
    );
    if (
      !signatureValid ||
      attestation.manifest.schemaVersion !== AUDIT_SCHEMA_VERSION ||
      attestation.manifest.environment !== AUDIT_ENVIRONMENT ||
      !isProductionManifest(attestation.manifest) ||
      !validManifestWindow(attestation.manifest) ||
      attestation.observedAt.toISOString() !==
        attestation.manifest.observedAt ||
      attestation.validUntil.toISOString() !==
        attestation.manifest.validUntil ||
      (!allowExpired && attestation.validUntil.getTime() <= now.getTime())
    )
      return false;
    return (["deployment", "dependencies"] as const).every((resource) => {
      const envelope = parseEnvelope(
        manifestEnvelope(attestation.manifest, resource),
        resource,
      );
      return (
        envelope !== undefined &&
        envelope.attestation.kid === attestation.kid &&
        envelope.deploymentDigest === attestation.manifest.deploymentDigest &&
        verifyEnvelopeAttestation(
          {
            schemaVersion: envelope.schemaVersion,
            observedAt: envelope.observedAt,
            validUntil: envelope.validUntil,
            environment: envelope.environment,
            deploymentDigest: envelope.deploymentDigest,
            cardinality: envelope.cardinality,
            evidence: envelope.evidence,
          },
          envelope.attestation,
        )
      );
    });
  } catch {
    return false;
  }
}
function validManifestWindow(manifest: Record<string, unknown>): boolean {
  const observedAt = parseDate(manifest.observedAt);
  const validUntil = parseDate(manifest.validUntil);
  return Boolean(
    observedAt &&
    validUntil &&
    validUntil.getTime() > observedAt.getTime() &&
    validUntil.getTime() - observedAt.getTime() <= MAX_EVIDENCE_AGE_MS,
  );
}
export function verifiedCurrentReleaseIdentityDigest(
  attestation: ReleaseAttestationRecord,
  now: Date,
): string | undefined {
  if (!signedManifestIsValid(attestation, now, true)) return undefined;
  const observedAt = parseDate(attestation.manifest.observedAt);
  const digest = attestation.manifest.deploymentDigest;
  if (
    !observedAt ||
    observedAt.getTime() > now.getTime() + 30_000 ||
    typeof digest !== "string" ||
    !DIGEST_PATTERN.test(digest)
  )
    return undefined;
  return digest;
}
export function verifiedCurrentReleaseDigest(
  attestation: ReleaseAttestationRecord,
  now: Date,
): string | undefined {
  if (!signedManifestIsValid(attestation, now)) return undefined;
  const observedAt = parseDate(attestation.manifest.observedAt);
  const validUntil = parseDate(attestation.manifest.validUntil);
  const deploymentDigest = attestation.manifest.deploymentDigest;
  if (!observedAt || !validUntil || typeof deploymentDigest !== "string")
    return undefined;
  try {
    validateFreshness(observedAt, validUntil, now);
  } catch {
    return undefined;
  }
  return deploymentDigest;
}
function buildEnvelope(
  record: AuditEvidenceRecord,
  resource: AuditResource,
  now: Date,
): AuditEnvelope {
  validateFreshness(record.observedAt, record.validUntil, now);
  if (
    record.resource !== resource ||
    record.environment !== AUDIT_ENVIRONMENT ||
    record.cardinality !== 1 ||
    !DIGEST_PATTERN.test(record.deploymentDigest)
  )
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría no cumple el contrato.",
    );
  let evidence;
  try {
    evidence = parseAuditEvidence(record.evidence, resource);
  } catch {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría no cumple el contrato.",
    );
  }
  if (evidence.observedAt !== record.observedAt.toISOString())
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría no cumple el contrato.",
    );
  const attestation = readAttestation(record.attestation);
  if (!attestation)
    throw auditError(
      503,
      "evidence_unavailable",
      "La atestación de auditoría no es válida.",
    );
  const unsigned: Omit<AuditEnvelope, "attestation"> = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    observedAt: record.observedAt.toISOString(),
    validUntil: record.validUntil.toISOString(),
    environment: AUDIT_ENVIRONMENT,
    deploymentDigest: record.deploymentDigest,
    cardinality: 1,
    evidence,
  };
  if (!verifyEnvelopeAttestation(unsigned, attestation))
    throw auditError(
      503,
      "evidence_unavailable",
      "La atestación de auditoría no es válida.",
    );
  const result = { ...unsigned, attestation };
  assertAuditResponseSize(result);
  return result;
}
@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_EVIDENCE_REPOSITORY)
    private readonly repository: AuditEvidenceRepository,
    @Inject(AUDIT_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}
  async readCurrentReleaseDigest(): Promise<string> {
    const attestation = await this.withTimeout(
      this.repository.findLatestReleaseAttestation(),
    );
    const digest = attestation
      ? verifiedCurrentReleaseIdentityDigest(attestation, this.clock())
      : undefined;
    if (!digest)
      throw auditError(
        503,
        "evidence_unavailable",
        "La atestación de release no está disponible.",
      );
    return digest;
  }
  async read(
    resource: AuditResource,
    identity: AuditTechnicalIdentity,
  ): Promise<AuditEnvelope> {
    void identity;
    const now = this.clock();
    if (resource === "deployment" || resource === "dependencies")
      return this.readAttested(resource, now);
    const record = await this.withTimeout(
      this.repository.findLatestEvidence(resource),
    );
    if (!record)
      throw auditError(
        503,
        "evidence_unavailable",
        "La evidencia de auditoría no está disponible.",
      );
    return buildEnvelope(record, resource, now);
  }
  private async readAttested(
    resource: "deployment" | "dependencies",
    now: Date,
  ): Promise<AuditEnvelope> {
    const attestation = await this.withTimeout(
      this.repository.findLatestReleaseAttestation(),
    );
    if (!attestation || !signedManifestIsValid(attestation, now))
      throw auditError(
        503,
        "evidence_unavailable",
        "La atestación de release no está disponible.",
      );
    const envelope = parseEnvelope(
      manifestEnvelope(attestation.manifest, resource),
      resource,
    );
    if (!envelope)
      throw auditError(
        503,
        "evidence_unavailable",
        "La evidencia de release no está disponible.",
      );
    validateFreshness(
      new Date(envelope.observedAt),
      new Date(envelope.validUntil),
      now,
    );
    assertAuditResponseSize(envelope);
    return envelope;
  }
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            auditError(
              503,
              "evidence_unavailable",
              "La evidencia de auditoría no responde.",
            ),
          ),
        MAX_QUERY_TIME_MS,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
