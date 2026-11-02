import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PostgresScanStore,
  ScanLeaseLostError,
  type ClaimedScanJob,
  type ScanCheck,
} from "./scan-store.js";
import { runDevelopmentSecurityMigrations } from "./run-migrations.js";
import { isSafePostgresTestTarget } from "./postgres-test-safety.js";

const TEST_DATABASE_URL = process.env.DS_TEST_DATABASE_URL;
const TEST_POSTGRES_ISOLATED = process.env.DS_TEST_POSTGRES_ISOLATED;
const TEST_HOSTNAME = "sample.example.net";
const TEST_PROFILE = "controls-v1";
const TEST_SCANNER = "scanner-test-version";
const TEST_NOW = new Date();
const TEST_START = new Date(TEST_NOW.getTime() - 60_000);
const TEST_LEASE_MS = 30_000;
const MAX_ATTEMPTS = 2;

const describePostgres = isSafePostgresTestTarget(
  TEST_DATABASE_URL,
  TEST_POSTGRES_ISOLATED,
)
  ? describe
  : describe.skip;

describePostgres.sequential("PostgresScanStore", () => {
  let pool: Pool;
  let store: PostgresScanStore;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    store = new PostgresScanStore(pool);
    await runDevelopmentSecurityMigrations(pool);
  });

  beforeEach(async () => {
    if (!pool) return;
    await pool.query(
      `TRUNCATE ds_scan_metrics, ds_check_results, ds_scan_runs,
       ds_scan_jobs, ds_domains CASCADE`,
    );
    await store.ensureDomain(TEST_HOSTNAME, "monitored", TEST_PROFILE);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("keeps domain enrollment stable when on-demand requests repeat", async () => {
    await store.ensureDomain(TEST_HOSTNAME, "on_demand", "new-profile");
    const result = await pool.query(
      "SELECT enrollment, profile_version FROM ds_domains WHERE hostname = $1",
      [TEST_HOSTNAME],
    );

    expect(result.rows[0]).toEqual({
      enrollment: "monitored",
      profile_version: TEST_PROFILE,
    });
  });

  it("shares one active job across concurrent requests", async () => {
    const requests = Array.from({ length: 10 }, () =>
      store.ensureFreshScan({
        hostname: TEST_HOSTNAME,
        profileVersion: TEST_PROFILE,
        trigger: "requested",
        now: TEST_NOW,
      }),
    );
    const results = await Promise.all(requests);
    const jobIds = new Set(
      results.map((result) => result.kind !== "cached" && result.jobId),
    );

    expect(jobIds.size).toBe(1);
    expect([...jobIds][0]).toBeTruthy();
    expect(results.every((result) => result.kind === "queued")).toBe(true);
  });

  it("gives a queued job to only one concurrent worker", async () => {
    await store.ensureFreshScan({
      hostname: TEST_HOSTNAME,
      profileVersion: TEST_PROFILE,
      trigger: "requested",
      now: TEST_NOW,
    });
    const claims = await Promise.all(
      Array.from({ length: 10 }, () =>
        store.claimNextScan(TEST_NOW, TEST_LEASE_MS),
      ),
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("reuses only reports younger than 60 minutes", async () => {
    const first = await queueAndClaim();
    const reportId = await complete(first);

    const beforeExpiry = await store.ensureFreshScan({
      hostname: TEST_HOSTNAME,
      profileVersion: TEST_PROFILE,
      trigger: "requested",
      now: new Date(TEST_NOW.getTime() + 60 * 60 * 1000 - 1),
    });
    const atExpiry = await store.ensureFreshScan({
      hostname: TEST_HOSTNAME,
      profileVersion: TEST_PROFILE,
      trigger: "requested",
      now: new Date(TEST_NOW.getTime() + 60 * 60 * 1000),
    });

    expect(beforeExpiry).toEqual({ kind: "cached", reportId });
    expect(atExpiry.kind).toBe("queued");
  });

  it("does not reuse a fresh report when the profile version changes", async () => {
    const job = await queueAndClaim();
    const reportId = await complete(job);
    const changedProfile = await store.ensureFreshScan({
      hostname: TEST_HOSTNAME,
      profileVersion: "controls-v2",
      trigger: "requested",
      now: new Date(),
    });

    expect(reportId).toBeTruthy();
    expect(changedProfile.kind).toBe("queued");
  });

  it("recovers expired leases and fails after the retry limit", async () => {
    const first = await queueAndClaim();
    await pool.query(
      "UPDATE ds_scan_jobs SET lease_until = clock_timestamp() - interval '1 second' WHERE id = $1",
      [first.id],
    );
    expect(await store.recoverExpiredLeases(new Date(), MAX_ATTEMPTS)).toBe(1);

    const second = await store.claimNextScan(new Date(), TEST_LEASE_MS);
    expect(second?.attempts).toBe(2);
    if (!second) throw new Error("expected_claimed_scan");

    await pool.query(
      "UPDATE ds_scan_jobs SET lease_until = clock_timestamp() - interval '1 second' WHERE id = $1",
      [second.id],
    );
    expect(await store.recoverExpiredLeases(new Date(), MAX_ATTEMPTS)).toBe(1);
    const result = await pool.query(
      "SELECT state, public_error_code FROM ds_scan_jobs WHERE id = $1",
      [first.id],
    );
    expect(result.rows[0]).toEqual({
      state: "failed",
      public_error_code: "worker_lease_expired",
    });
  });

  it("renews only a current unexpired lease", async () => {
    const job = await queueAndClaim();
    const renewRequestedAt = new Date();
    const earliestExpiry = renewRequestedAt.getTime() + TEST_LEASE_MS - 2_000;

    await expect(
      store.renewScanLease(
        job.id,
        job.leaseToken,
        renewRequestedAt,
        TEST_LEASE_MS,
      ),
    ).resolves.toBe(true);
    await expect(
      store.renewScanLease(
        job.id,
        "e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2",
        renewRequestedAt,
        TEST_LEASE_MS,
      ),
    ).resolves.toBe(false);
    const result = await pool.query(
      "SELECT lease_until FROM ds_scan_jobs WHERE id = $1",
      [job.id],
    );
    expect(
      new Date(result.rows[0].lease_until).getTime(),
    ).toBeGreaterThanOrEqual(earliestExpiry);
  });

  it("commits a report atomically and rejects stale lease holders", async () => {
    const job = await queueAndClaim();
    const reportId = await complete(job);
    const counts = await pool.query(
      `SELECT
         (SELECT count(*) FROM ds_scan_runs WHERE id = $1)::integer AS runs,
         (SELECT count(*) FROM ds_check_results WHERE run_id = $1)::integer AS checks,
         (SELECT count(*) FROM ds_scan_metrics WHERE run_id = $1)::integer AS metrics`,
      [reportId],
    );

    expect(counts.rows[0]).toEqual({ runs: 1, checks: 1, metrics: 1 });
    await expect(complete(job)).rejects.toBeInstanceOf(ScanLeaseLostError);
    await expect(
      pool.query("UPDATE ds_scan_runs SET verdict = 'pass' WHERE id = $1", [
        reportId,
      ]),
    ).rejects.toThrow("Development Security reports are immutable");
  });

  it("rolls back a partially inserted report when a check violates uniqueness", async () => {
    const job = await queueAndClaim();
    const duplicateChecks = [CHECK, { ...CHECK }];

    await expect(complete(job, duplicateChecks)).rejects.toThrow();
    const afterFailure = await pool.query(
      `SELECT
         (SELECT count(*) FROM ds_scan_runs)::integer AS runs,
         (SELECT count(*) FROM ds_check_results)::integer AS checks,
         (SELECT count(*) FROM ds_scan_metrics)::integer AS metrics`,
    );
    expect(afterFailure.rows[0]).toEqual({ runs: 0, checks: 0, metrics: 0 });
    await expect(complete(job)).resolves.toBeTruthy();
  });

  it("retains reports for 90 days and purges older rows through the owner function", async () => {
    const oldStartedAt = new Date("2026-06-01T10:00:00.000Z");
    const oldCompletedAt = new Date(oldStartedAt.getTime() + 15_000);
    const job = await queueAndClaim();
    const runId = await complete(job, [CHECK], oldStartedAt, oldCompletedAt);
    const tooRecentCutoff = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);

    await expect(
      pool.query("SELECT ds_purge_expired_reports($1)", [tooRecentCutoff]),
    ).rejects.toThrow("report_retention_window_not_reached");

    const retentionCutoff = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const purge = await pool.query<{ ds_purge_expired_reports: number }>(
      "SELECT ds_purge_expired_reports($1)",
      [retentionCutoff],
    );
    const remaining = await pool.query(
      `SELECT
         (SELECT count(*) FROM ds_scan_runs WHERE id = $1)::integer AS runs,
         (SELECT count(*) FROM ds_check_results WHERE run_id = $1)::integer AS checks,
         (SELECT count(*) FROM ds_scan_metrics WHERE run_id = $1)::integer AS metrics`,
      [runId],
    );

    expect(purge.rows[0].ds_purge_expired_reports).toBe(3);
    expect(remaining.rows[0]).toEqual({ runs: 0, checks: 0, metrics: 0 });
  });

  async function queueAndClaim(now: Date = TEST_NOW): Promise<ClaimedScanJob> {
    await store.ensureFreshScan({
      hostname: TEST_HOSTNAME,
      profileVersion: TEST_PROFILE,
      trigger: "requested",
      now,
    });
    const job = await store.claimNextScan(now, TEST_LEASE_MS);
    if (!job) throw new Error("expected_claimed_scan");
    return job;
  }

  async function complete(
    job: ClaimedScanJob,
    checks: readonly ScanCheck[] = [CHECK],
    startedAt: Date = TEST_START,
    completedAt: Date = TEST_NOW,
  ): Promise<string> {
    return store.completeScan({
      jobId: job.id,
      leaseToken: job.leaseToken,
      scannerVersion: TEST_SCANNER,
      startedAt,
      completedAt,
      verdict: "inconclusive",
      scope: ["/"],
      checks,
      metrics: {
        requestsCount: 0,
        bytesCount: 0,
        durationMs: 0,
        pagesCount: 0,
      },
    });
  }

  const CHECK: ScanCheck = {
    controlId: "DS-DNS-01",
    status: "unknown",
    required: true,
    severity: "high",
    observedAt: TEST_NOW,
    targetPath: "/",
    method: "DNS",
    summary: "No se evaluó en esta prueba de persistencia.",
    limitation: "Prueba sintética; no representa un escaneo operativo.",
    evidence: { result: "test_fixture" },
  };
});
