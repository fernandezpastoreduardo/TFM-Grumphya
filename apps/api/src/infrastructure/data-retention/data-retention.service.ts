import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { Pool } from "pg";
import { runMigrations } from "../database/run-migrations";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 500;
const EXPIRED_DATA_DELETIONS = [
  `WITH due AS (
     SELECT token_hash FROM registration_intents
     WHERE expires_at <= now() ORDER BY expires_at LIMIT ${DELETE_BATCH_SIZE}
     FOR UPDATE SKIP LOCKED
   ) DELETE FROM registration_intents AS intent USING due
     WHERE intent.token_hash=due.token_hash`,
  `WITH due AS (
     SELECT pending.user_id FROM pending_registrations AS pending
     JOIN users AS user_account ON user_account.id=pending.user_id
     WHERE pending.verification_expires_at <= now()
       AND pending.verified_token_hash IS NULL
       AND user_account.status='pending_email_verification'
     ORDER BY pending.verification_expires_at LIMIT ${DELETE_BATCH_SIZE}
     FOR UPDATE OF pending SKIP LOCKED
   ) DELETE FROM users AS user_account USING due
     WHERE user_account.id=due.user_id`,
  `WITH due AS (
     SELECT id FROM auth_sessions
     WHERE expires_at <= now() OR revoked_at <= now() - interval '30 days'
     ORDER BY expires_at LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM auth_sessions AS session USING due WHERE session.id=due.id`,
  `WITH due AS (
     SELECT ctid FROM password_reset_tokens
     WHERE expires_at <= now() ORDER BY expires_at LIMIT ${DELETE_BATCH_SIZE}
     FOR UPDATE SKIP LOCKED
   ) DELETE FROM password_reset_tokens AS token USING due WHERE token.ctid=due.ctid`,
  `WITH due AS (
     SELECT ip_hmac FROM anonymous_ip_activity
     WHERE expires_at <= now() ORDER BY expires_at LIMIT ${DELETE_BATCH_SIZE}
     FOR UPDATE SKIP LOCKED
   ) DELETE FROM anonymous_ip_activity AS activity USING due
     WHERE activity.ip_hmac=due.ip_hmac`,
  `WITH due AS (
     SELECT id FROM anonymous_visitors
     WHERE last_seen_at <= now() - interval '400 days'
     ORDER BY last_seen_at LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM anonymous_visitors AS visitor USING due WHERE visitor.id=due.id`,
  `WITH due AS (
     SELECT ctid FROM anonymous_usage_requests
     WHERE expires_at <= now() ORDER BY expires_at LIMIT ${DELETE_BATCH_SIZE}
     FOR UPDATE SKIP LOCKED
   ) DELETE FROM anonymous_usage_requests AS request USING due WHERE request.ctid=due.ctid`,
  `WITH due AS (
     SELECT ctid FROM account_plan_usage_requests
     WHERE expires_at <= now() ORDER BY expires_at LIMIT ${DELETE_BATCH_SIZE}
     FOR UPDATE SKIP LOCKED
   ) DELETE FROM account_plan_usage_requests AS request USING due WHERE request.ctid=due.ctid`,
  `WITH due AS (
     SELECT idempotency_hash FROM rejected_idea_idempotency
     WHERE expires_at <= now() ORDER BY expires_at LIMIT ${DELETE_BATCH_SIZE}
     FOR UPDATE SKIP LOCKED
   ) DELETE FROM rejected_idea_idempotency AS request USING due
     WHERE request.idempotency_hash=due.idempotency_hash`,
  `WITH due AS (
     SELECT aggregate.rejected_idea_id FROM rejected_idea_all_time_counts AS aggregate
     WHERE aggregate.last_received_at <= now() - interval '24 months'
     ORDER BY aggregate.last_received_at LIMIT ${DELETE_BATCH_SIZE}
     FOR UPDATE OF aggregate SKIP LOCKED
   ) DELETE FROM rejected_idea_all_time_counts AS aggregate USING due
     WHERE aggregate.rejected_idea_id=due.rejected_idea_id`,
  `WITH due AS (
     SELECT id FROM rejected_ideas
     WHERE last_received_at <= now() - interval '24 months'
     ORDER BY last_received_at LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM rejected_ideas AS idea USING due WHERE idea.id=due.id`,
  `WITH due AS (
     SELECT user_id, plan_code, usage_date FROM account_daily_plan_usage
     WHERE usage_date <= (now() - interval '12 months')::date
     ORDER BY usage_date LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM account_daily_plan_usage AS usage USING due
     WHERE usage.user_id=due.user_id AND usage.plan_code=due.plan_code
       AND usage.usage_date=due.usage_date`,
  `WITH due AS (
     SELECT id FROM contact_messages
     WHERE created_at <= now() - interval '12 months'
     ORDER BY created_at LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM contact_messages AS message USING due WHERE message.id=due.id`,
  `WITH due AS (
     SELECT id FROM admin_ai_usage_events
     WHERE occurred_at <= now() - interval '12 months'
     ORDER BY occurred_at LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM admin_ai_usage_events AS event USING due WHERE event.id=due.id`,
  `WITH due AS (
     SELECT id FROM application_error_events
     WHERE occurred_at <= now() - interval '30 days'
     ORDER BY occurred_at LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM application_error_events AS event USING due WHERE event.id=due.id`,
  `WITH due AS (
     SELECT ctid FROM anonymous_analytics_daily
     WHERE metric_date < (now() AT TIME ZONE 'Europe/Madrid')::date - interval '13 months'
     ORDER BY metric_date LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM anonymous_analytics_daily AS metric USING due WHERE metric.ctid=due.ctid`,
  `WITH due AS (
     SELECT user_id, idempotency_hash FROM account_roast_message_events
     WHERE created_at <= now() - interval '12 months'
     ORDER BY created_at LIMIT ${DELETE_BATCH_SIZE} FOR UPDATE SKIP LOCKED
   ) DELETE FROM account_roast_message_events AS event USING due
     WHERE event.user_id=due.user_id AND event.idempotency_hash=due.idempotency_hash`,
] as const;

@Injectable()
export class DataRetentionService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DataRetentionService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private cleanupInProgress: Promise<void> | undefined;
  private schemaReady: Promise<void> | undefined;

  constructor(
    private readonly pool: Pool,
    private readonly migrationRunner: (
      pool: Pool,
    ) => Promise<void> = runMigrations,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.cleanupInProgress;
    await this.pool.end();
  }

  private cleanup(): Promise<void> {
    if (this.cleanupInProgress) return this.cleanupInProgress;
    this.cleanupInProgress = this.runCleanup().finally(() => {
      this.cleanupInProgress = undefined;
    });
    return this.cleanupInProgress;
  }

  private async runCleanup(): Promise<void> {
    try {
      this.schemaReady ??= this.migrationRunner(this.pool).catch(
        (error: unknown) => {
          this.schemaReady = undefined;
          throw error;
        },
      );
      await this.schemaReady;
      for (const statement of EXPIRED_DATA_DELETIONS) {
        let affectedRows = DELETE_BATCH_SIZE;
        while (affectedRows === DELETE_BATCH_SIZE) {
          const result = await this.pool.query(statement);
          affectedRows = result.rowCount ?? 0;
        }
      }
    } catch {
      this.logger.warn(
        "Scheduled data retention cleanup failed; it will retry on the next interval.",
      );
    }
  }
}
