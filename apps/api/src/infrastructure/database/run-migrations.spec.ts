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
    ).toHaveLength(32);
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
    expect(query).toHaveBeenCalledWith(
      "INSERT INTO schema_migrations(version) VALUES($1)",
      ["032_worst_ideas_all_time_ranking"],
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
