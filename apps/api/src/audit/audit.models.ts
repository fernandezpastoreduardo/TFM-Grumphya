export const AUDIT_SCHEMA_VERSION = "beta-d-0.2" as const;
export const AUDIT_RESOURCES = [
  "infrastructure",
  "deployment",
  "dependencies",
  "auth",
  "quality",
  "privacy",
  "ai",
] as const;

export type AuditResource = (typeof AUDIT_RESOURCES)[number];
export type AuditScope = `audit:${AuditResource}`;
export const AUDIT_ENVIRONMENT = "production" as const;
export const AUDIT_ATTESTATION_ALGORITHM = "EdDSA" as const;
export const AUDIT_RELEASE_ATTESTATION_KID = "grumphya-release-2026" as const;

export type AuditAttestation = {
  alg: typeof AUDIT_ATTESTATION_ALGORITHM;
  kid: string;
  signature: string;
};

export type AuditEnvelope = {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  observedAt: string;
  validUntil: string;
  environment: typeof AUDIT_ENVIRONMENT;
  deploymentDigest: string;
  cardinality: 1;
  evidence: import("./audit-signals").AuditEvidence;
  attestation: AuditAttestation;
};

export type AuditEvidenceRecord = {
  resource: AuditResource;
  observedAt: Date;
  validUntil: Date;
  environment: string;
  deploymentDigest: string;
  jwtKid: string;
  cardinality: 1;
  evidence: import("./audit-signals").AuditEvidence;
  attestation: unknown;
};

export type ReleaseAttestationRecord = {
  manifest: Record<string, unknown>;
  signature: string;
  kid: string;
  observedAt: Date;
  validUntil: Date;
};

export interface AuditEvidenceRepository {
  findLatestEvidence(
    resource: AuditResource,
  ): Promise<AuditEvidenceRecord | null>;
  findLatestReleaseAttestation(): Promise<ReleaseAttestationRecord | null>;
}

export const AUDIT_EVIDENCE_REPOSITORY = Symbol("AUDIT_EVIDENCE_REPOSITORY");
export const AUDIT_CLOCK = Symbol("AUDIT_CLOCK");
