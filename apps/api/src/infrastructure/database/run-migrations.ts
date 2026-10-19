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
  { version: "008_anonymous_usage", file: "008_anonymous_usage.sql" },
  {
    version: "009_account_daily_plan_usage",
    file: "009_account_daily_plan_usage.sql",
  },
  { version: "010_approved_ideas", file: "010_approved_ideas.sql" },
  {
    version: "011_approved_idea_idempotency",
    file: "011_approved_idea_idempotency.sql",
  },
  {
    version: "012_auth_session_persistence",
    file: "012_auth_session_persistence.sql",
  },
  {
    version: "013_approved_idea_request_hash",
    file: "013_approved_idea_request_hash.sql",
  },
  {
    version: "014_ephemeral_auth_retention_indexes",
    file: "014_ephemeral_auth_retention_indexes.sql",
  },
  {
    version: "015_account_plan_usage_requests",
    file: "015_account_plan_usage_requests.sql",
  },
  {
    version: "016_auth_refresh_rotation_history",
    file: "016_auth_refresh_rotation_history.sql",
  },
  {
    version: "017_worst_ideas_rubric_score",
    file: "017_worst_ideas_rubric_score.sql",
  },
  {
    version: "018_user_rejected_ideas",
    file: "018_user_rejected_ideas.sql",
  },
  {
    version: "019_user_roast_message_count",
    file: "019_user_roast_message_count.sql",
  },
  {
    version: "020_roast_message_events",
    file: "020_roast_message_events.sql",
  },
  { version: "021_user_avatar", file: "021_user_avatar.sql" },
  { version: "022_contact_messages", file: "022_contact_messages.sql" },
] as const;

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(728194031)");
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
