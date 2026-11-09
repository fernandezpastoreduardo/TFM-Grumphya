import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { runMigrations } from "./run-migrations";

function fakePool(query: ReturnType<typeof vi.fn>) {
  const client = { query, release: vi.fn() };
  return {
    pool: { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool,
    client,
  };
}

describe("controlled database migrations", () => {
  it("serializes migration runs and skips versions already applied", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [{ version: values?.[0] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool, client } = fakePool(query);

    await runMigrations(pool);

    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(728194031)",
    );
    expect(
      query.mock.calls.filter(([sql]) =>
        sql.startsWith("SELECT version FROM schema_migrations"),
      ),
    ).toHaveLength(38);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(query).not.toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("applies the bounded diagnostic context migration", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    const migrationSql = query.mock.calls.find(([sql]) =>
      String(sql).includes("ADD COLUMN IF NOT EXISTS context_json jsonb"),
    )?.[0];
    expect(migrationSql).toContain(
      "length(context_json->>'inputText') <= 2000",
    );
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["031_application_error_context"],
    );
  });

  it("redacts legacy application error contexts", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("SET context_json = NULL"),
      ),
    ).toBe(true);
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["036_redact_application_error_context"],
    );
  });

  it("creates only dimension counters for anonymous analytics", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    const migrationSql = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        "CREATE TABLE IF NOT EXISTS anonymous_analytics_daily",
      ),
    )?.[0];
    expect(migrationSql).toContain("metric_date date NOT NULL");
    expect(migrationSql).toContain("event_count bigint NOT NULL");
    expect(migrationSql).not.toMatch(
      /user_id|ip_address|session|cookie|event_id/i,
    );
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["037_anonymous_analytics"],
    );
  });

  it("creates and backfills the safe all-time rejected-idea aggregate", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    const migrationSql = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        "CREATE TABLE IF NOT EXISTS rejected_idea_all_time_counts",
      ),
    )?.[0];
    expect(migrationSql).toContain("safe_title text NOT NULL");
    expect(migrationSql).toContain("submission_count bigint NOT NULL");
    expect(migrationSql).toContain("last_received_at timestamptz NOT NULL");
    expect(migrationSql).toContain("SELECT id, safe_title, count");
    expect(migrationSql).toContain("FROM rejected_ideas");
    expect(migrationSql).toContain("ON CONFLICT (rejected_idea_id) DO NOTHING");
    expect(migrationSql).not.toMatch(/original_idea|idea_text|author|email/i);
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["032_worst_ideas_all_time_ranking"],
    );
  });

  it("adds the nullable generated headline column for rejected-idea matches", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    const migrationSql = query.mock.calls.find(([sql]) =>
      String(sql).includes("ADD COLUMN IF NOT EXISTS generated_headline text"),
    )?.[0];
    expect(migrationSql).toContain("ALTER TABLE rejected_idea_idempotency");
    expect(migrationSql).not.toMatch(/DEFAULT|NOT NULL|UPDATE|DELETE|DROP/i);
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["033_rejected_idea_match_headline"],
    );
  });

  it("reprices Iluminado and its historical purchases without changing subscriptions", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    const migrationSql = query.mock.calls.find(([sql]) =>
      String(sql).includes("SET amount_eur = 3.00"),
    )?.[0];
    expect(migrationSql).toMatch(
      /UPDATE plans\s+SET monthly_price_eur\s*=\s*3\.00\s+WHERE code\s*=\s*'ILUMINADO'/i,
    );
    expect(migrationSql).toMatch(/SET amount_eur\s*=\s*3\.00/i);
    expect(migrationSql).toMatch(/subscription\.plan_code\s*=\s*'ILUMINADO'/i);
    expect(migrationSql).not.toMatch(/UPDATE subscriptions/i);
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["034_illuminado_price_retroactive"],
    );
  });

  it("preserves historical AI costs when adding cached input token counts", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    const migrationSql = query.mock.calls.find(([sql]) =>
      String(sql).includes(
        "ADD COLUMN IF NOT EXISTS cached_input_tokens integer",
      ),
    )?.[0];
    expect(migrationSql).toContain("NOT NULL DEFAULT 0");
    expect(migrationSql).toContain("cached_input_tokens <= input_tokens");
    expect(migrationSql).not.toMatch(
      /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b|estimated_cost_usd/i,
    );
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["035_admin_ai_cached_input_tokens"],
    );
  });

  it("does not automatically opt existing administrator accounts into public rankings", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    expect(
      query.mock.calls.some(([sql]) =>
        /UPDATE\s+users\s+SET\s+public_rankings_consent_(?:at|policy_version)/i.test(
          String(sql),
        ),
      ),
    ).toBe(false);
    const recordedVersions = query.mock.calls
      .filter(([sql]) =>
        String(sql).startsWith(
          "INSERT INTO schema_migrations(version) VALUES($1)",
        ),
      )
      .map(([, values]) => values?.[0]);
    expect(recordedVersions).toContain("032_worst_ideas_all_time_ranking");
    expect(recordedVersions).toContain("033_rejected_idea_match_headline");

    const consentSchemaSql = query.mock.calls.find(([sql]) =>
      String(sql).includes("users_public_rankings_consent_pair_check"),
    )?.[0];
    expect(consentSchemaSql).toContain(
      "ADD COLUMN IF NOT EXISTS public_rankings_consent_at timestamptz",
    );
    expect(consentSchemaSql).not.toMatch(/DEFAULT\s+now\s*\(\)/i);
    expect(consentSchemaSql).not.toMatch(/UPDATE\s+users/i);
  });

  it("rolls back the migration transaction and releases the client on failure", async () => {
    let pendingMigration = false;
    const query = vi.fn(async (sql: string) => {
      if (pendingMigration) throw new Error("migration failed");
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        pendingMigration = true;
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool, client } = fakePool(query);

    await expect(runMigrations(pool)).rejects.toThrow("migration failed");

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
