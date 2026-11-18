export const AUDIT_SCHEMA_VERSION = "beta-d-0.2" as const;
export const AUDIT_RESOURCES = [
  "infrastructure",
  "deployment",
  "dependencies",
  "auth",
  "quality",
  "privacy",
] as const;

export type AuditResource = (typeof AUDIT_RESOURCES)[number];
export type AuditScope = `audit:${AuditResource}`;

export type AuditEnvelope = {
  schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  observedAt: string;
  validUntil: string;
  items: unknown[];
};

export type AuditEvidenceRecord = {
  resource: AuditResource;
  observedAt: Date;
  validUntil: Date;
  items: unknown[];
};

export type ReleaseAttestationRecord = {
  manifest: Record<string, unknown>;
  signature: string;
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
