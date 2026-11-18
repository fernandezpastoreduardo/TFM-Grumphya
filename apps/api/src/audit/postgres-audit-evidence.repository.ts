import type { Pool } from "pg";
import type {
  AuditEvidenceRecord,
  AuditResource,
  ReleaseAttestationRecord,
  AuditEvidenceRepository,
} from "./audit.models";

type EvidenceRow = {
  resource: AuditResource;
  observed_at: Date;
  valid_until: Date;
  items: unknown;
};

type AttestationRow = {
  manifest: unknown;
  signature: string;
  observed_at: Date;
  valid_until: Date;
};

export class PostgresAuditEvidenceRepository implements AuditEvidenceRepository {
  constructor(private readonly pool: Pool) {}

  async findLatestEvidence(
    resource: AuditResource,
  ): Promise<AuditEvidenceRecord | null> {
    const result = await this.pool.query<EvidenceRow>(
      `SELECT resource, observed_at, valid_until, items
       FROM audit.evidence
       WHERE resource = $1
       ORDER BY observed_at DESC
       LIMIT 1`,
      [resource],
    );
    const row = result.rows[0];
    if (!row || !Array.isArray(row.items)) return null;
    return {
      resource: row.resource,
      observedAt: row.observed_at,
      validUntil: row.valid_until,
      items: row.items,
    };
  }

  async findLatestReleaseAttestation(): Promise<ReleaseAttestationRecord | null> {
    const result = await this.pool.query<AttestationRow>(
      `SELECT manifest, signature, observed_at, valid_until
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
      observedAt: row.observed_at,
      validUntil: row.valid_until,
    };
  }
}
