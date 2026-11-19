import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

const defineMigration = (version: string, file: string) => ({ version, file });

const MIGRATIONS = [
  defineMigration("001_registration", "001_registration.sql"),
  defineMigration("002_sessions", "002_sessions.sql"),
  defineMigration("003_registration_plans", "003_registration_plans.sql"),
  defineMigration(
    "004_registration_lifecycle",
    "004_registration_lifecycle.sql",
  ),
  defineMigration("005_worst_ideas", "005_worst_ideas.sql"),
  defineMigration("006_verified_token_expiry", "006_verified_token_expiry.sql"),
  defineMigration(
    "007_idempotency_request_hash",
    "007_idempotency_request_hash.sql",
  ),
  defineMigration("008_anonymous_usage", "008_anonymous_usage.sql"),
  defineMigration(
    "009_account_daily_plan_usage",
    "009_account_daily_plan_usage.sql",
  ),
  defineMigration("010_approved_ideas", "010_approved_ideas.sql"),
  defineMigration(
    "011_approved_idea_idempotency",
    "011_approved_idea_idempotency.sql",
  ),
  defineMigration(
    "012_auth_session_persistence",
    "012_auth_session_persistence.sql",
  ),
  defineMigration(
    "013_approved_idea_request_hash",
    "013_approved_idea_request_hash.sql",
  ),
  defineMigration(
    "014_ephemeral_auth_retention_indexes",
    "014_ephemeral_auth_retention_indexes.sql",
  ),
  defineMigration(
    "015_account_plan_usage_requests",
    "015_account_plan_usage_requests.sql",
  ),
  defineMigration(
    "016_auth_refresh_rotation_history",
    "016_auth_refresh_rotation_history.sql",
  ),
  defineMigration(
    "017_worst_ideas_rubric_score",
    "017_worst_ideas_rubric_score.sql",
  ),
  defineMigration("018_user_rejected_ideas", "018_user_rejected_ideas.sql"),
  defineMigration(
    "019_user_roast_message_count",
    "019_user_roast_message_count.sql",
  ),
  defineMigration("020_roast_message_events", "020_roast_message_events.sql"),
  defineMigration("021_user_avatar", "021_user_avatar.sql"),
  defineMigration("022_contact_messages", "022_contact_messages.sql"),
  defineMigration("023_admin_dashboard", "023_admin_dashboard.sql"),
  defineMigration(
    "024_admin_ai_usage_attribution",
    "024_admin_ai_usage_attribution.sql",
  ),
  defineMigration(
    "025_contact_confirmation_delivery",
    "025_contact_confirmation_delivery.sql",
  ),
  defineMigration(
    "026_registration_verification_delivery",
    "026_registration_verification_delivery.sql",
  ),
  defineMigration("027_password_reset_tokens", "027_password_reset_tokens.sql"),
  defineMigration(
    "028_admin_contact_message_replies",
    "028_admin_contact_message_replies.sql",
  ),
  defineMigration(
    "029_application_error_diagnostics",
    "029_application_error_diagnostics.sql",
  ),
  defineMigration(
    "030_public_rankings_consent",
    "030_public_rankings_consent.sql",
  ),
  defineMigration(
    "031_application_error_context",
    "031_application_error_context.sql",
  ),
  defineMigration(
    "032_worst_ideas_all_time_ranking",
    "032_worst_ideas_all_time_ranking.sql",
  ),
  defineMigration(
    "033_rejected_idea_match_headline",
    "033_rejected_idea_match_headline.sql",
  ),
  defineMigration(
    "034_illuminado_price_retroactive",
    "034_illuminado_price_retroactive.sql",
  ),
  defineMigration(
    "035_admin_ai_cached_input_tokens",
    "035_admin_ai_cached_input_tokens.sql",
  ),
  defineMigration(
    "036_redact_application_error_context",
    "036_redact_application_error_context.sql",
  ),
  defineMigration("037_anonymous_analytics", "037_anonymous_analytics.sql"),
  defineMigration(
    "038_admin_lighthouse_quality",
    "038_admin_lighthouse_quality.sql",
  ),
  defineMigration("039_audit_evidence", "039_audit_evidence.sql"),
  defineMigration(
    "040_audit_contract_beta_d02",
    "040_audit_contract_beta_d02.sql",
  ),
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
