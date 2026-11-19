import { Inject, Injectable } from "@nestjs/common";
import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { auditError } from "./audit-errors";
import { assertAuditResponseSize } from "./audit-request-policy";
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
const REQUIRED_HOSTNAME = "grumphya.com" as const;
const RELEASE_ATTESTATION_KID = "grumphya-release-2026" as const;
const IMAGE_NAMES = ["api", "web", "database", "proxy"] as const;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ATTESTATION_KEYS = ["alg", "kid", "signature"] as const;
const ENVELOPE_KEYS = [
  "hostname",
  "environment",
  "generatedAt",
  "expiresAt",
  "profile",
  "scope",
  "evidence",
  "attestation",
  "kid",
] as const;

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

function validateFreshness(
  generatedAt: Date,
  expiresAt: Date,
  now: Date,
): void {
  if (
    !Number.isFinite(generatedAt.getTime()) ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime() ||
    generatedAt.getTime() > now.getTime() + 30_000
  ) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría ha caducado.",
    );
  }
  if (now.getTime() - generatedAt.getTime() > MAX_EVIDENCE_AGE_MS) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría es demasiado antigua.",
    );
  }
}

function readAttestation(value: unknown): AuditAttestation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== ATTESTATION_KEYS.length ||
    !ATTESTATION_KEYS.every((key) => key in record) ||
    record.alg !== AUDIT_ATTESTATION_ALGORITHM ||
    typeof record.kid !== "string" ||
    record.kid.length === 0 ||
    typeof record.signature !== "string" ||
    record.signature.length === 0
  ) {
    return undefined;
  }
  return {
    alg: AUDIT_ATTESTATION_ALGORITHM,
    kid: record.kid,
    signature: record.signature,
  };
}

function validateEvidenceContent(value: unknown): boolean {
  if (typeof value === "string") {
    return (
      value.length <= 2048 &&
      !/<[^>]+>/u.test(value) &&
      !/https?:\/\//u.test(value)
    );
  }
  if (Array.isArray(value)) {
    return value.length <= 1 && value.every(validateEvidenceContent);
  }
  if (value === null || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, child]) =>
      !/(cookie|token|password|authorization|email|url|html|script|trace|sbom|^packages?$|^package[_-](list|inventory)$)/iu.test(
        key,
      ) && validateEvidenceContent(child),
  );
}

function verifyEnvelopeAttestation(
  unsigned: Omit<AuditEnvelope, "attestation">,
  attestation: AuditAttestation,
): boolean {
  const publicKeyPem = readManifestPublicKey();
  const allowedKids = readAllowedManifestKids();
  if (!publicKeyPem || !allowedKids.includes(attestation.kid)) return false;
  try {
    const publicKey = createPublicKey(publicKeyPem);
    return verify(
      null,
      Buffer.from(stableJson(unsigned)),
      publicKey,
      Buffer.from(attestation.signature, "base64url"),
    );
  } catch {
    return false;
  }
}

function unsignedEnvelope(
  resource: AuditResource,
  evidence: unknown,
  generatedAt: Date,
  expiresAt: Date,
  jwtKid: string,
): Omit<AuditEnvelope, "attestation"> {
  return {
    hostname: REQUIRED_HOSTNAME,
    environment: AUDIT_ENVIRONMENT,
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    profile: AUDIT_SCHEMA_VERSION,
    scope: `audit:${resource}`,
    evidence,
    kid: jwtKid,
  };
}

function assertCardinality(value: unknown, cardinality: number): void {
  if (
    cardinality !== 1 ||
    (Array.isArray(value) && value.length > 1) ||
    !validateEvidenceContent(value)
  ) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría no cumple el contrato.",
    );
  }
}

function buildEnvelope(
  value: AuditEvidenceRecord,
  resource: AuditResource,
  identity: AuditTechnicalIdentity,
  now: Date,
): AuditEnvelope {
  validateFreshness(value.observedAt, value.validUntil, now);
  if (
    value.resource !== resource ||
    value.environment !== AUDIT_ENVIRONMENT ||
    value.jwtKid !== identity.kid
  ) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría no está vinculada a la identidad solicitante.",
    );
  }
  assertCardinality(value.evidence, value.cardinality);
  const attestation = readAttestation(value.attestation);
  if (!attestation) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La atestación de auditoría no es válida.",
    );
  }
  const unsigned = unsignedEnvelope(
    resource,
    value.evidence,
    value.observedAt,
    value.validUntil,
    identity.kid,
  );
  if (!verifyEnvelopeAttestation(unsigned, attestation)) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La atestación de auditoría no es válida.",
    );
  }
  const result: AuditEnvelope = { ...unsigned, attestation };
  assertAuditResponseSize(result);
  return result;
}

function parseStoredEnvelope(
  value: unknown,
  resource: AuditResource,
): AuditEnvelope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== ENVELOPE_KEYS.length ||
    !ENVELOPE_KEYS.every((key) => key in record) ||
    record.hostname !== REQUIRED_HOSTNAME ||
    record.environment !== AUDIT_ENVIRONMENT ||
    record.profile !== AUDIT_SCHEMA_VERSION ||
    record.scope !== `audit:${resource}` ||
    typeof record.generatedAt !== "string" ||
    typeof record.expiresAt !== "string" ||
    typeof record.kid !== "string" ||
    record.kid.length === 0 ||
    !validateEvidenceContent(record.evidence)
  ) {
    return undefined;
  }
  const attestation = readAttestation(record.attestation);
  if (!attestation) return undefined;
  return {
    hostname: REQUIRED_HOSTNAME,
    environment: AUDIT_ENVIRONMENT,
    generatedAt: record.generatedAt,
    expiresAt: record.expiresAt,
    profile: AUDIT_SCHEMA_VERSION,
    scope: `audit:${resource}`,
    evidence: record.evidence,
    attestation,
    kid: record.kid,
  };
}

function validateStoredEnvelope(
  stored: AuditEnvelope,
  resource: AuditResource,
  identity: AuditTechnicalIdentity,
  now: Date,
): AuditEnvelope {
  if (stored.kid !== identity.kid) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La evidencia de auditoría no está vinculada a la identidad activa.",
    );
  }
  const generatedAt = new Date(stored.generatedAt);
  const expiresAt = new Date(stored.expiresAt);
  validateFreshness(generatedAt, expiresAt, now);
  const unsigned = unsignedEnvelope(
    resource,
    stored.evidence,
    generatedAt,
    expiresAt,
    identity.kid,
  );
  if (!verifyEnvelopeAttestation(unsigned, stored.attestation)) {
    throw auditError(
      503,
      "evidence_unavailable",
      "La atestación de auditoría no es válida.",
    );
  }
  assertAuditResponseSize(stored);
  return stored;
}

function isProductionManifest(manifest: Record<string, unknown>): boolean {
  const deployment = manifest.deployment;
  const deploymentDigest = manifest.deploymentDigest;
  if (
    !deployment ||
    typeof deployment !== "object" ||
    typeof deploymentDigest !== "string" ||
    !DIGEST_PATTERN.test(deploymentDigest)
  ) {
    return false;
  }
  const deploymentRecord = deployment as Record<string, unknown>;
  const deploymentSha = deploymentRecord.deploymentSha;
  const images = deploymentRecord.images;
  if (
    typeof deploymentSha !== "string" ||
    !/^[0-9a-f]{40}$/u.test(deploymentSha) ||
    !images ||
    typeof images !== "object"
  ) {
    return false;
  }
  const imageRecord = images as Record<string, unknown>;
  return (
    IMAGE_NAMES.every(
      (name) =>
        typeof imageRecord[name] === "string" &&
        DIGEST_PATTERN.test(imageRecord[name] as string),
    ) &&
    Object.keys(imageRecord).length === IMAGE_NAMES.length &&
    deploymentSha === process.env.DEPLOY_SHA
  );
}

function manifestEnvelope(
  manifest: Record<string, unknown>,
  resource: AuditResource,
): unknown {
  const audit = manifest.audit;
  if (!audit || typeof audit !== "object") return undefined;
  const envelopes = (audit as Record<string, unknown>).envelopes;
  if (!envelopes || typeof envelopes !== "object") return undefined;
  return (envelopes as Record<string, unknown>)[resource];
}

function signedManifestIsValid(
  attestation: ReleaseAttestationRecord,
  now: Date,
): boolean {
  const publicKeyPem = readManifestPublicKey();
  const allowedKids = readAllowedManifestKids();
  if (
    !publicKeyPem ||
    !allowedKids.includes(attestation.kid) ||
    attestation.kid !== RELEASE_ATTESTATION_KID
  ) {
    return false;
  }
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const signatureValid = verify(
      null,
      Buffer.from(stableJson(attestation.manifest)),
      publicKey,
      Buffer.from(attestation.signature, "base64url"),
    );
    const envelopesValid = (["deployment", "dependencies"] as const).every(
      (resource) => {
        const envelope = parseStoredEnvelope(
          manifestEnvelope(attestation.manifest, resource),
          resource,
        );
        return (
          envelope !== undefined &&
          envelope.attestation.kid === attestation.kid &&
          verifyEnvelopeAttestation(
            {
              hostname: envelope.hostname,
              environment: envelope.environment,
              generatedAt: envelope.generatedAt,
              expiresAt: envelope.expiresAt,
              profile: envelope.profile,
              scope: envelope.scope,
              evidence: envelope.evidence,
              kid: envelope.kid,
            },
            envelope.attestation,
          )
        );
      },
    );
    return (
      signatureValid &&
      attestation.manifest.schemaVersion === AUDIT_SCHEMA_VERSION &&
      attestation.manifest.environment === AUDIT_ENVIRONMENT &&
      isProductionManifest(attestation.manifest) &&
      typeof attestation.manifest.dependencies === "object" &&
      attestation.manifest.dependencies !== null &&
      envelopesValid &&
      attestation.validUntil.getTime() > now.getTime()
    );
  } catch {
    return false;
  }
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_EVIDENCE_REPOSITORY)
    private readonly repository: AuditEvidenceRepository,
    @Inject(AUDIT_CLOCK)
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async read(
    resource: AuditResource,
    identity: AuditTechnicalIdentity,
  ): Promise<AuditEnvelope> {
    const now = this.clock();
    if (resource === "deployment" || resource === "dependencies") {
      return this.readAttested(resource, identity, now);
    }
    const record = await this.withTimeout(
      this.repository.findLatestEvidence(resource),
    );
    if (!record) {
      throw auditError(
        503,
        "evidence_unavailable",
        "La evidencia de auditoría no está disponible.",
      );
    }
    return buildEnvelope(record, resource, identity, now);
  }

  private async readAttested(
    resource: "deployment" | "dependencies",
    identity: AuditTechnicalIdentity,
    now: Date,
  ): Promise<AuditEnvelope> {
    const attestation = await this.withTimeout(
      this.repository.findLatestReleaseAttestation(),
    );
    if (!attestation || !signedManifestIsValid(attestation, now)) {
      throw auditError(
        503,
        "evidence_unavailable",
        "La atestación de release no está disponible.",
      );
    }
    const envelope = parseStoredEnvelope(
      manifestEnvelope(attestation.manifest, resource),
      resource,
    );
    if (!envelope) {
      throw auditError(
        503,
        "evidence_unavailable",
        "La evidencia de release no está disponible.",
      );
    }
    return validateStoredEnvelope(envelope, resource, identity, now);
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
