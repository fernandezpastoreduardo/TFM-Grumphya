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
    ).toHaveLength(33);
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

  it("opts existing administrator accounts into the public rankings", async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT version FROM schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { pool } = fakePool(query);

    await runMigrations(pool);

    const migrationSql = query.mock.calls.find(([sql]) =>
      String(sql).includes("public_rankings_consent_policy_version = 'v2'"),
    )?.[0];
    expect(migrationSql).toContain("UPDATE users");
    expect(migrationSql).toContain("WHERE role = 'admin'");
    expect(migrationSql).toContain("username_normalized = 'jappy'");
    expect(migrationSql).toContain("public_rankings_consent_at IS NULL");
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["033_admin_rankings_opt_in"],
    );
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
