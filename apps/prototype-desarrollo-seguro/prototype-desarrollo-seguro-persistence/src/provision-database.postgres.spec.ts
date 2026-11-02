import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  provisionDevelopmentSecurityDatabase,
  type ProvisioningSettings,
} from "./provision-database.js";
import type { ScanCheck } from "./scan-store.js";
import {
  assertSafePostgresTestTarget,
  isSafePostgresTestTarget,
  POSTGRES_TEST_OPT_IN,
  POSTGRES_TEST_OPT_IN_VALUE,
} from "./postgres-test-safety.js";

const ADMIN_DATABASE_URL = process.env.DS_TEST_DATABASE_URL;
const POSTGRES_TEST_OPT_IN_VALUE_FROM_ENV = process.env[POSTGRES_TEST_OPT_IN];
const TEST_DATABASE_NAME = "development_security_test_provisioned";
const MIGRATOR_PASSWORD = "development-security-migrator-test-only";
const API_PASSWORD = "prototype-desarrollo-seguro-api-test-only";
const WORKER_PASSWORD = "prototype-desarrollo-seguro-worker-test-only";
const CONTROLS_V1_IDS = [
  "DS-DNS-01",
  "DS-TLS-01",
  "DS-TLS-02",
  "DS-HTTP-01",
  "DS-HDR-01",
  "DS-PRIV-01",
  "DS-PRIV-02",
  "DS-PRIV-03",
  "DS-QUAL-01",
] as const;

const describePostgres = isSafePostgresTestTarget(
  ADMIN_DATABASE_URL,
  POSTGRES_TEST_OPT_IN_VALUE_FROM_ENV,
)
  ? describe
  : describe.skip;

describe("PostgreSQL test target safety guard", () => {
  it("requires explicit opt-in before enabling destructive integration tests", () => {
    expect(() =>
      assertSafePostgresTestTarget(
        "postgres://localhost/development_security_test_admin",
        undefined,
      ),
    ).toThrow("DS_TEST_POSTGRES_ISOLATED_opt_in_required");
  });

  it("rejects a non-loopback database host even with explicit opt-in", () => {
    expect(() =>
      assertSafePostgresTestTarget(
        "postgres://db.example.com/development_security_test_admin",
        POSTGRES_TEST_OPT_IN_VALUE,
      ),
    ).toThrow("DS_TEST_DATABASE_URL_must_use_loopback");
  });

  it("rejects connection-string host overrides even when the URL host is loopback", () => {
    expect(() =>
      assertSafePostgresTestTarget(
        "postgres://localhost/development_security_test_admin?host=db.example.com",
        POSTGRES_TEST_OPT_IN_VALUE,
      ),
    ).toThrow("DS_TEST_DATABASE_URL_overrides_forbidden");
  });

  it("rejects a database name outside the isolated test prefix", () => {
    expect(() =>
      assertSafePostgresTestTarget(
        "postgres://127.0.0.1/grumphya",
        POSTGRES_TEST_OPT_IN_VALUE,
      ),
    ).toThrow("DS_TEST_DATABASE_URL_must_target_isolated_database");
  });

  it("accepts a loopback database only with the isolated cluster opt-in", () => {
    expect(
      assertSafePostgresTestTarget(
        "postgres://[::1]/development_security_test_admin",
        POSTGRES_TEST_OPT_IN_VALUE,
      ).hostname,
    ).toBe("[::1]");
  });
});

describePostgres.sequential(
  "Development Security database provisioning",
  () => {
    let adminPool: Pool | undefined;
    let targetAdminPool: Pool | undefined;
    let databaseWasAbsentBeforeTest = false;
    let rolesWereAbsentBeforeTest = false;

    beforeAll(async () => {
      if (!ADMIN_DATABASE_URL) return;
      assertSafePostgresTestTarget(
        ADMIN_DATABASE_URL,
        POSTGRES_TEST_OPT_IN_VALUE_FROM_ENV,
      );
      adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
      const existingObjects = await adminPool.query<{
        database_exists: boolean;
        role_count: number;
      }>(
        `SELECT
           EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS database_exists,
           (SELECT count(*)::integer FROM pg_roles
             WHERE rolname = ANY($2)) AS role_count`,
        [TEST_DATABASE_NAME, ["ds_read", "ds_migrator", "ds_api", "ds_worker"]],
      );
      if (
        existingObjects.rows[0]?.database_exists ||
        existingObjects.rows[0]?.role_count !== 0
      ) {
        throw new Error("development_security_test_cluster_must_be_clean");
      }
      databaseWasAbsentBeforeTest = true;
      rolesWereAbsentBeforeTest = true;
      const targetUrl = new URL(ADMIN_DATABASE_URL);
      targetUrl.pathname = `/${TEST_DATABASE_NAME}`;
      targetAdminPool = new Pool({
        connectionString: targetUrl.toString(),
        max: 1,
      });
      const settings: ProvisioningSettings = {
        adminUrl: ADMIN_DATABASE_URL,
        databaseName: TEST_DATABASE_NAME,
        migratorPassword: MIGRATOR_PASSWORD,
        apiPassword: API_PASSWORD,
        workerPassword: WORKER_PASSWORD,
      };
      await provisionDevelopmentSecurityDatabase(settings);
    });

    afterAll(async () => {
      if (!adminPool) return;
      try {
        await targetAdminPool?.end();
        if (databaseWasAbsentBeforeTest) {
          await adminPool.query(
            `DROP DATABASE IF EXISTS "${TEST_DATABASE_NAME}" WITH (FORCE)`,
          );
        }
        if (rolesWereAbsentBeforeTest) {
          await adminPool.query("REVOKE ds_read FROM ds_api, ds_worker");
          await adminPool.query(
            "DROP ROLE IF EXISTS ds_api, ds_worker, ds_read, ds_migrator",
          );
        }
      } finally {
        await adminPool.end();
      }
    });

    it("creates separate least-privilege runtime roles and an owned database", async () => {
      const result = await targetAdminPool?.query<{
        database_owner: string;
        api_can_select: boolean;
        api_can_insert_jobs: boolean;
        api_can_write_reports: boolean;
        worker_can_update_state: boolean;
        worker_can_update_hostname: boolean;
        worker_can_execute_completion: boolean;
        migrator_can_execute_retention: boolean;
        api_can_execute_retention: boolean;
        worker_can_execute_retention: boolean;
        worker_can_insert_reports: boolean;
        worker_can_delete_reports: boolean;
        reader_can_select: boolean;
        reader_can_insert: boolean;
      }>(
        `SELECT
         (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = $1) AS database_owner,
         has_table_privilege('ds_api', 'ds_domains', 'SELECT') AS api_can_select,
         has_table_privilege('ds_api', 'ds_scan_jobs', 'INSERT') AS api_can_insert_jobs,
         has_table_privilege('ds_api', 'ds_scan_runs', 'INSERT') AS api_can_write_reports,
         has_column_privilege('ds_worker', 'ds_scan_jobs', 'state', 'UPDATE') AS worker_can_update_state,
         has_column_privilege('ds_worker', 'ds_scan_jobs', 'hostname', 'UPDATE') AS worker_can_update_hostname,
         has_function_privilege('ds_worker', 'public.ds_complete_scan(uuid,uuid,timestamp with time zone,text,timestamp with time zone,text,jsonb,jsonb,jsonb)', 'EXECUTE') AS worker_can_execute_completion,
         has_function_privilege('ds_migrator', 'public.ds_purge_expired_reports(timestamp with time zone)', 'EXECUTE') AS migrator_can_execute_retention,
         has_function_privilege('ds_api', 'public.ds_purge_expired_reports(timestamp with time zone)', 'EXECUTE') AS api_can_execute_retention,
         has_function_privilege('ds_worker', 'public.ds_purge_expired_reports(timestamp with time zone)', 'EXECUTE') AS worker_can_execute_retention,
         has_table_privilege('ds_worker', 'ds_scan_runs', 'INSERT') AS worker_can_insert_reports,
         has_table_privilege('ds_worker', 'ds_scan_runs', 'DELETE') AS worker_can_delete_reports,
         has_table_privilege('ds_read', 'ds_scan_runs', 'SELECT') AS reader_can_select,
         has_table_privilege('ds_read', 'ds_scan_runs', 'INSERT') AS reader_can_insert`,
        [TEST_DATABASE_NAME],
      );

      expect(result?.rows[0]).toEqual({
        database_owner: "ds_migrator",
        api_can_select: true,
        api_can_insert_jobs: true,
        api_can_write_reports: false,
        worker_can_update_state: false,
        worker_can_update_hostname: false,
        worker_can_execute_completion: true,
        migrator_can_execute_retention: true,
        api_can_execute_retention: false,
        worker_can_execute_retention: false,
        worker_can_insert_reports: false,
        worker_can_delete_reports: false,
        reader_can_select: true,
        reader_can_insert: false,
      });
    });

    it("marks managed roles and keeps memberships limited to the reader role", async () => {
      const roleComments = await adminPool?.query<{
        rolname: string;
        role_comment: string | null;
      }>(
        `SELECT rolname, shobj_description(oid, 'pg_authid') AS role_comment
         FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname`,
        [["ds_api", "ds_migrator", "ds_read", "ds_worker"]],
      );
      expect(roleComments?.rows).toEqual(
        ["ds_api", "ds_migrator", "ds_read", "ds_worker"].map((rolname) => ({
          rolname,
          role_comment: "development_security: managed role v1",
        })),
      );

      const memberships = await adminPool?.query<{
        member_role: string;
        granted_role: string;
      }>(
        `SELECT member.rolname AS member_role, granted.rolname AS granted_role
         FROM pg_auth_members AS memberships
         JOIN pg_roles AS member ON member.oid = memberships.member
         JOIN pg_roles AS granted ON granted.oid = memberships.roleid
         WHERE member.rolname = ANY($1)
         ORDER BY member.rolname, granted.rolname`,
        [["ds_api", "ds_migrator", "ds_read", "ds_worker"]],
      );
      expect(memberships?.rows).toEqual([
        { member_role: "ds_api", granted_role: "ds_read" },
        { member_role: "ds_worker", granted_role: "ds_read" },
      ]);
    });

    it("can be rerun without duplicating schema or changing role boundaries", async () => {
      if (!ADMIN_DATABASE_URL) return;
      await provisionDevelopmentSecurityDatabase({
        adminUrl: ADMIN_DATABASE_URL,
        databaseName: TEST_DATABASE_NAME,
        migratorPassword: MIGRATOR_PASSWORD,
        apiPassword: API_PASSWORD,
        workerPassword: WORKER_PASSWORD,
      });
      const result = await targetAdminPool?.query(
        "SELECT count(*)::integer AS migration_count FROM public.ds_schema_migrations",
      );
      expect(result?.rows[0].migration_count).toBe(4);
    });

    it("lets the worker complete through the function but not insert reports directly", async () => {
      const job = await createRunningJob("permission", false, "controls-v1");
      const client = await targetAdminPool!.connect();
      try {
        await client.query("SET ROLE ds_worker");
        const privileges = await client.query<{
          can_execute: boolean;
          can_insert: boolean;
        }>(
          `SELECT
             has_function_privilege(current_user, 'public.ds_complete_scan(uuid,uuid,timestamptz,text,timestamptz,text,jsonb,jsonb,jsonb)', 'EXECUTE') AS can_execute,
             has_table_privilege(current_user, 'public.ds_scan_runs', 'INSERT') AS can_insert`,
        );
        expect(privileges.rows[0]).toEqual({
          can_execute: true,
          can_insert: false,
        });
        await expect(
          client.query("INSERT INTO ds_scan_runs DEFAULT VALUES"),
        ).rejects.toThrow(/permission denied/u);

        const report = await callCompleteScan(client, job, "inconclusive");
        const persisted = await client.query(
          `SELECT runs.hostname, runs.profile_version, runs.trigger,
                  jobs.hostname AS job_hostname,
                  jobs.profile_version AS job_profile_version,
                  jobs.trigger AS job_trigger
           FROM ds_scan_runs AS runs
           JOIN ds_scan_jobs AS jobs ON jobs.id = runs.job_id
           WHERE runs.id = $1`,
          [report.id],
        );
        expect(persisted.rows[0]).toEqual({
          hostname: job.hostname,
          profile_version: job.profileVersion,
          trigger: "scheduled",
          job_hostname: job.hostname,
          job_profile_version: job.profileVersion,
          job_trigger: "scheduled",
        });
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("rejects a pass based on one required but unregistered control", async () => {
      const job = await createRunningJob("arbitrary", false, "controls-v1");
      const client = await targetAdminPool!.connect();
      try {
        await client.query("SET ROLE ds_worker");
        await expect(
          callCompleteScan(client, job, "pass", [makeCheck("DS-ARBITRARY-99")]),
        ).rejects.toThrow("scan_profile_controls_incomplete");
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("rejects a pass when controls-v1 coverage is incomplete", async () => {
      const job = await createRunningJob("partial", false, "controls-v1");
      const client = await targetAdminPool!.connect();
      try {
        await client.query("SET ROLE ds_worker");
        await expect(
          callCompleteScan(client, job, "pass", [
            makeCheck(CONTROLS_V1_IDS[0]),
          ]),
        ).rejects.toThrow("scan_profile_controls_incomplete");
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("accepts pass only when every required controls-v1 control passes", async () => {
      const controls = await targetAdminPool!.query<{
        control_id: string;
        required: boolean;
      }>(
        `SELECT control_id, required FROM ds_profile_controls
         WHERE profile_version = 'controls-v1' ORDER BY control_id`,
      );
      expect(controls.rows.map((control) => control.control_id).sort()).toEqual(
        [...CONTROLS_V1_IDS].sort(),
      );
      const job = await createRunningJob("complete", false, "controls-v1");
      const client = await targetAdminPool!.connect();
      try {
        await client.query("SET ROLE ds_worker");
        const checks: ScanCheck[] = controls.rows.map((control) => ({
          ...makeCheck(control.control_id),
          required: control.required,
        }));
        const report = await callCompleteScan(client, job, "pass", checks);
        const storedControls = await client.query<{ control_id: string }>(
          "SELECT control_id FROM ds_check_results WHERE run_id = $1 ORDER BY control_id",
          [report.id],
        );
        expect(storedControls.rows.map((check) => check.control_id)).toEqual(
          [...CONTROLS_V1_IDS].sort(),
        );
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("rejects completion when the worker lease has expired", async () => {
      const job = await createRunningJob("expired", true);
      const client = await targetAdminPool!.connect();
      try {
        await client.query("SET ROLE ds_worker");
        await expect(
          callCompleteScan(client, job, "inconclusive"),
        ).rejects.toThrow("scan_lease_lost");
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    it("rejects a verdict inconsistent with required checks", async () => {
      const job = await createRunningJob("verdict");
      const client = await targetAdminPool!.connect();
      try {
        await client.query("SET ROLE ds_worker");
        await expect(callCompleteScan(client, job, "pass")).rejects.toThrow(
          "scan_verdict_does_not_match_checks",
        );
      } finally {
        await client.query("RESET ROLE");
        client.release();
      }
    });

    async function createRunningJob(
      suffix: string,
      expired = false,
      profileVersion = "controls-v1",
    ): Promise<{
      id: string;
      leaseToken: string;
      hostname: string;
      profileVersion: string;
    }> {
      const hostname = `function-${suffix}-${randomUUID()}.example.net`;
      await targetAdminPool!.query(
        `INSERT INTO ds_domains(hostname, enrollment, profile_version)
         VALUES($1, 'on_demand', $2)`,
        [hostname, profileVersion],
      );
      const result = await targetAdminPool!.query<{
        id: string;
        lease_token: string;
      }>(
        `INSERT INTO ds_scan_jobs(
           hostname, profile_version, trigger, state, queued_at, available_at,
           lease_until, lease_token, attempts
         ) VALUES($1, $2, 'scheduled', 'running', clock_timestamp(), clock_timestamp(),
           CASE WHEN $3 THEN clock_timestamp() - interval '1 second'
                ELSE clock_timestamp() + interval '1 minute' END,
           gen_random_uuid(), 1)
         RETURNING id, lease_token`,
        [hostname, profileVersion, expired],
      );
      return {
        id: result.rows[0].id,
        leaseToken: result.rows[0].lease_token,
        hostname,
        profileVersion,
      };
    }

    async function callCompleteScan(
      client: PoolClient,
      job: { id: string; leaseToken: string },
      verdict: "pass" | "inconclusive",
      checks: readonly ScanCheck[] = [makeCheck("DS-HTTP-01", "unknown")],
    ): Promise<{ id: string }> {
      const completedAt = new Date();
      const startedAt = new Date(completedAt.getTime() - 1000);
      const result = await client.query<{ id: string }>(
        `SELECT public.ds_complete_scan(
           $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb
         ) AS id`,
        [
          job.id,
          job.leaseToken,
          completedAt,
          "scanner-test-version",
          startedAt,
          verdict,
          JSON.stringify(["/"]),
          JSON.stringify(
            checks.map((check) => ({ ...check, observedAt: completedAt })),
          ),
          JSON.stringify({
            requestsCount: 1,
            bytesCount: 0,
            durationMs: 1,
            pagesCount: 1,
          }),
        ],
      );
      return { id: result.rows[0].id };
    }

    function makeCheck(controlId: string, status: "pass" | "unknown" = "pass") {
      const methodByControl: Record<string, string> = {
        "DS-DNS-01": "DNS",
        "DS-TLS-01": "TLS",
        "DS-TLS-02": "TLS",
        "DS-HTTP-01": "HEAD",
        "DS-HDR-01": "GET",
        "DS-PRIV-01": "GET",
        "DS-PRIV-02": "GET",
        "DS-PRIV-03": "GET",
        "DS-QUAL-01": "GET",
      };
      return {
        controlId,
        status,
        required: true,
        severity: "high",
        observedAt: new Date(),
        targetPath: "/",
        method: methodByControl[controlId] ?? "GET",
        summary: `Comprobación ${controlId}: ${status}.`,
        limitation:
          "Resultado limitado a las rutas públicas declaradas del perfil controls-v1.",
        evidence: status === "pass" ? passingEvidence(controlId) : {},
      };
    }

    function passingEvidence(controlId: string): Record<string, unknown> {
      const evidenceByControl: Record<string, Record<string, unknown>> = {
        "DS-DNS-01": {
          addressClass: "public",
          aRecordCount: 1,
          aaaaRecordCount: 0,
        },
        "DS-TLS-01": {
          protocol: "TLSv1.3",
          certificateValid: true,
          hostnameMatches: true,
        },
        "DS-TLS-02": {
          tls10Accepted: false,
          tls11Accepted: false,
          tls12Accepted: true,
          tls13Accepted: true,
        },
        "DS-HTTP-01": {
          statusCode: 200,
          redirectedToHttps: true,
          finalScheme: "https",
        },
        "DS-HDR-01": {
          hsts: true,
          nosniff: true,
          frameProtection: true,
          referrerPolicy: true,
          csp: true,
        },
        "DS-PRIV-01": { thirdPartyAttempts: 0, blockedRequests: 0 },
        "DS-PRIV-02": {
          cookieCount: 0,
          insecureCookieCount: 0,
          thirdPartyCookieCount: 0,
          inspected: true,
        },
        "DS-PRIV-03": { mixedContentCount: 0, insecureNavigationCount: 0 },
        "DS-QUAL-01": {
          documentStatusCode: 200,
          failedEssentialResourceCount: 0,
        },
      };
      const evidence = evidenceByControl[controlId];
      return evidence ?? {};
    }
  },
);
