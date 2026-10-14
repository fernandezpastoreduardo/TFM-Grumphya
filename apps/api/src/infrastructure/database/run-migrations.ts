import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

const MIGRATIONS = [
  { version: "001_registration", file: "001_registration.sql" },
  { version: "002_sessions", file: "002_sessions.sql" },
  { version: "003_registration_plans", file: "003_registration_plans.sql" },
  {
    version: "004_registration_lifecycle",
    file: "004_registration_lifecycle.sql",
  },
  { version: "005_worst_ideas", file: "005_worst_ideas.sql" },
  {
    version: "006_verified_token_expiry",
    file: "006_verified_token_expiry.sql",
  },
  {
    version: "007_idempotency_request_hash",
    file: "007_idempotency_request_hash.sql",
  },
] as const;

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const migration of MIGRATIONS) {
      const applied = await client.query(
        "SELECT version FROM schema_migrations WHERE version=$1",
        [migration.version],
      );
      if (applied.rowCount) continue;
      const sql = readFileSync(
        resolve(__dirname, `../../../migrations/${migration.file}`),
        "utf8",
      );
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        migration.version,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
