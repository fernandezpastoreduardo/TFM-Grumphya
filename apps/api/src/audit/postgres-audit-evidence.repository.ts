import type { Pool } from "pg";
import type {
  AuditEvidenceRecord,
  AuditResource,
  ReleaseAttestationRecord,
  AuditEvidenceRepository,
} from "./audit.models";
import { parseAuditEvidence } from "./audit-signals";

type EvidenceRow = {
  resource: AuditResource;
  observed_at: Date;
  valid_until: Date;
  environment: string;
  cardinality: number;
  deployment_digest: string;
  jwt_kid: string;
  evidence: unknown;
  attestation: unknown;
};

type AttestationRow = {
  manifest: unknown;
  signature: string;
  kid: string;
  observed_at: Date;
  valid_until: Date;
};

export class PostgresAuditEvidenceRepository implements AuditEvidenceRepository {
  constructor(private readonly pool: Pool) {}

  async findLatestEvidence(
    resource: AuditResource,
  ): Promise<AuditEvidenceRecord | null> {
    const result = await this.pool.query<EvidenceRow>(
      `SELECT resource, observed_at, valid_until, environment,
              cardinality, deployment_digest, jwt_kid, items AS evidence, attestation
       FROM audit.evidence
       WHERE resource = $1
       ORDER BY observed_at DESC
       LIMIT 1`,
      [resource],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.cardinality !== 1) return null;
    let evidence;
    try {
      evidence = parseAuditEvidence(row.evidence, row.resource);
    } catch {
      return null;
    }
    return {
      resource: row.resource,
      observedAt: row.observed_at,
      validUntil: row.valid_until,
      environment: row.environment,
      cardinality: 1,
      deploymentDigest: row.deployment_digest,
      jwtKid: row.jwt_kid,
      evidence,
      attestation: row.attestation,
    };
  }

  async findLatestReleaseAttestation(): Promise<ReleaseAttestationRecord | null> {
    const result = await this.pool.query<AttestationRow>(
      `SELECT manifest, signature, kid, observed_at, valid_until
       FROM audit.release_attestations
       WHERE environment = 'production'
       ORDER BY observed_at DESC
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row || typeof row.manifest !== "object" || row.manifest === null)
      return null;
    return {
      manifest: row.manifest as Record<string, unknown>,
      signature: row.signature,
      kid: row.kid,
      observedAt: row.observed_at,
      validUntil: row.valid_until,
    };
  }
}
