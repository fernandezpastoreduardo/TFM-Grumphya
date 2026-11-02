import type { Pool, PoolClient } from "pg";
import {
  evaluateVerdict,
  sanitizeScanObservations,
} from "@grumphya/prototype-desarrollo-seguro-core";

const ACTIVE_JOB_STATES = ["queued", "running"] as const;
const MAX_LEASE_DURATION_MS = 5 * 60 * 1000;

export type ScanTrigger = "scheduled" | "requested";
export type ScanEnrollment = "monitored" | "on_demand";
export type ScanJobState = "queued" | "running" | "completed" | "failed";
export type ScanVerdict = "pass" | "fail" | "inconclusive";
export type CheckStatus = "pass" | "fail" | "unknown" | "not_applicable";

export type EnsureScanInput = {
  hostname: string;
  profileVersion: string;
  trigger: ScanTrigger;
  now: Date;
};

export type EnsureScanResult =
  | { kind: "cached"; reportId: string }
  | { kind: "queued" | "running"; jobId: string };

export type ClaimedScanJob = {
  id: string;
  hostname: string;
  profileVersion: string;
  trigger: ScanTrigger;
  attempts: number;
  leaseToken: string;
  leaseUntil: Date;
};

export type ScanCheck = {
  controlId: string;
  status: CheckStatus;
  required: boolean;
  severity: string;
  observedAt: Date;
  targetPath: string;
  method: string;
  summary: string;
  limitation: string;
  evidence: Record<string, unknown>;
};

export type ScanRunInput = {
  jobId: string;
  leaseToken: string;
  hostname: string;
  profileVersion: string;
  scannerVersion: string;
  startedAt: Date;
  completedAt: Date;
  verdict: ScanVerdict;
  scope: readonly string[];
  checks: readonly ScanCheck[];
  metrics: {
    requestsCount: number;
    bytesCount: number;
    durationMs: number;
    pagesCount: number;
  };
};

export interface ScanJobStore {
  claimNextScan(
    now: Date,
    leaseDurationMs: number,
  ): Promise<ClaimedScanJob | null>;
  renewScanLease(
    jobId: string,
    leaseToken: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<boolean>;
  completeScan(input: ScanRunInput): Promise<string>;
}

export class ScanLeaseLostError extends Error {
  constructor() {
    super("scan_lease_lost");
    this.name = "ScanLeaseLostError";
  }
}

export class PostgresScanStore implements ScanJobStore {
  constructor(private readonly pool: Pool) {}

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ensureDomain(
    hostname: string,
    enrollment: ScanEnrollment,
    profileVersion: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO ds_domains(hostname, enrollment, profile_version)
       VALUES($1, $2, $3)
       ON CONFLICT(hostname) DO NOTHING`,
      [hostname, enrollment, profileVersion],
    );
  }

  async ensureFreshScan(input: EnsureScanInput): Promise<EnsureScanResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const fresh = await client.query<{ id: string }>(
        `SELECT id FROM ds_scan_runs
         WHERE hostname = $1 AND profile_version = $2
           AND completed_at <= $3
           AND completed_at > $3 - interval '60 minutes'
         ORDER BY completed_at DESC LIMIT 1`,
        [input.hostname, input.profileVersion, input.now],
      );
      if (fresh.rows[0]) {
        await client.query("COMMIT");
        return { kind: "cached", reportId: fresh.rows[0].id };
      }

      const existing = await client.query<{
        id: string;
        state: "queued" | "running";
      }>(
        `SELECT id, state FROM ds_scan_jobs
         WHERE hostname = $1 AND profile_version = $2 AND state = ANY($3)
         LIMIT 1 FOR UPDATE`,
        [input.hostname, input.profileVersion, ACTIVE_JOB_STATES],
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return {
          kind: existing.rows[0].state,
          jobId: existing.rows[0].id,
        };
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ds_scan_jobs(
           hostname, profile_version, trigger, state, queued_at, available_at
         ) VALUES($1, $2, $3, 'queued', $4, $4)
         ON CONFLICT(hostname, profile_version)
           WHERE state IN ('queued', 'running') DO NOTHING
         RETURNING id`,
        [input.hostname, input.profileVersion, input.trigger, input.now],
      );
      if (inserted.rows[0]) {
        await client.query("COMMIT");
        return { kind: "queued", jobId: inserted.rows[0].id };
      }

      const raced = await findActiveJob(
        client,
        input.hostname,
        input.profileVersion,
      );
      if (!raced) {
        throw new Error("active_scan_job_missing_after_conflict");
      }
      await client.query("COMMIT");
      return { kind: raced.state, jobId: raced.id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async claimNextScan(
    _now: Date,
    leaseDurationMs: number,
  ): Promise<ClaimedScanJob | null> {
    if (
      !Number.isSafeInteger(leaseDurationMs) ||
      leaseDurationMs < 1 ||
      leaseDurationMs > MAX_LEASE_DURATION_MS
    ) {
      throw new Error("invalid_scan_lease_duration");
    }

    const result = await this.pool.query<{
      id: string;
      hostname: string;
      profile_version: string;
      trigger: ScanTrigger;
      attempts: number;
      lease_token: string;
      lease_until: Date;
    }>("SELECT * FROM ds_claim_next_scan($1)", [leaseDurationMs]);
    const job = result.rows[0];
    if (!job) return null;

    return {
      id: job.id,
      hostname: job.hostname,
      profileVersion: job.profile_version,
      trigger: job.trigger,
      attempts: job.attempts,
      leaseToken: job.lease_token,
      leaseUntil: job.lease_until,
    };
  }

  async recoverExpiredLeases(_now: Date, maxAttempts: number): Promise<number> {
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error("invalid_scan_max_attempts");
    }

    const result = await this.pool.query<{
      ds_recover_expired_scan_leases: number;
    }>("SELECT ds_recover_expired_scan_leases($1)", [maxAttempts]);
    return result.rows[0]?.ds_recover_expired_scan_leases ?? 0;
  }

  async renewScanLease(
    jobId: string,
    leaseToken: string,
    _now: Date,
    leaseDurationMs: number,
  ): Promise<boolean> {
    if (
      !Number.isSafeInteger(leaseDurationMs) ||
      leaseDurationMs < 1 ||
      leaseDurationMs > MAX_LEASE_DURATION_MS
    ) {
      throw new Error("invalid_scan_lease_duration");
    }
    const result = await this.pool.query<{ ds_renew_scan_lease: boolean }>(
      "SELECT ds_renew_scan_lease($1, $2, $3)",
      [jobId, leaseToken, leaseDurationMs],
    );
    return result.rows[0]?.ds_renew_scan_lease ?? false;
  }

  async completeScan(input: ScanRunInput): Promise<string> {
    const observations = sanitizeScanObservations(
      input.hostname,
      input.profileVersion,
      input.scope,
      input.checks,
    );
    if (evaluateVerdict(observations.checks) !== input.verdict) {
      throw new Error("scan_verdict_does_not_match_checks");
    }

    try {
      const result = await this.pool.query<{ ds_complete_scan: string }>(
        `SELECT ds_complete_scan(
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb
        )`,
        [
          input.jobId,
          input.leaseToken,
          input.completedAt,
          input.scannerVersion,
          input.startedAt,
          input.verdict,
          JSON.stringify(observations.scope),
          JSON.stringify(observations.checks),
          JSON.stringify(input.metrics),
        ],
      );
      const runId = result.rows[0]?.ds_complete_scan;
      if (!runId) throw new Error("scan_run_insert_failed");
      return runId;
    } catch (error) {
      if (error instanceof Error && error.message.includes("scan_lease_lost")) {
        throw new ScanLeaseLostError();
      }
      throw error;
    }
  }
}

async function findActiveJob(
  client: PoolClient,
  hostname: string,
  profileVersion: string,
): Promise<{ id: string; state: "queued" | "running" } | null> {
  const result = await client.query<{
    id: string;
    state: "queued" | "running";
  }>(
    `SELECT id, state FROM ds_scan_jobs
     WHERE hostname = $1 AND profile_version = $2 AND state = ANY($3)
     LIMIT 1`,
    [hostname, profileVersion, ACTIVE_JOB_STATES],
  );
  return result.rows[0] ?? null;
}
