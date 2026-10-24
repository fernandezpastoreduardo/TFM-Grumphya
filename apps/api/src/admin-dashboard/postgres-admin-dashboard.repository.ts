import { Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import {
  calculateEstimatedCostUsd,
  type AiUsageRecord,
} from "../infrastructure/ai/ai-usage";
import type {
  AdminApplicationErrorDetail,
  AdminContactMessage,
  ContactMessageReplyClaim,
  AdminDashboardRepository,
  AdminDashboardSnapshot,
} from "./admin-dashboard.models";
import {
  parseApplicationErrorContext,
  type ApplicationErrorContext,
} from "../infrastructure/observability/application-error-context";

const CONTACT_MESSAGE_LIMIT = 100;
const MAX_ERROR_CODE_LENGTH = 100;
const MAX_ADMIN_REPLY_ATTEMPTS = 2;

type SnapshotRow = {
  weekly_revenue_eur: string;
  total_revenue_eur: string;
  weekly_ai_cost_usd: string;
  total_ai_cost_usd: string;
  weekly_user_ai_cost_usd: string;
  total_user_ai_cost_usd: string;
  weekly_admin_ai_cost_usd: string;
  total_admin_ai_cost_usd: string;
  weekly_anonymous_ai_cost_usd: string;
  total_anonymous_ai_cost_usd: string;
  registered_user_count: string;
  admin_user_count: string;
  unpriced_usage_events: string;
};

type CostTrendRow = {
  week_start: string;
  registered_users_usd: string;
  admins_usd: string;
  anonymous_usd: string;
  total_usd: string;
};

@Injectable()
export class PostgresAdminDashboardRepository implements AdminDashboardRepository {
  private readonly pool: Pool;
  private ready?: Promise<void>;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async getSnapshot(): Promise<AdminDashboardSnapshot> {
    await this.ensureSchema();
    const [summary, errorRows, trendRows] = await Promise.all([
      this.pool.query<SnapshotRow>(`
        WITH boundaries AS (
          SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')
            AT TIME ZONE 'Europe/Madrid' AS week_start
        ), account_counts AS (
          SELECT
            count(*) FILTER (WHERE role = 'user')::bigint AS registered_count,
            count(*) FILTER (WHERE role = 'admin')::bigint AS admin_count
          FROM users WHERE status = 'active'
        ), costs AS (
          SELECT
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE occurred_at >= boundaries.week_start), 0) AS weekly_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd), 0) AS total_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE occurred_at >= boundaries.week_start AND actor_type = 'registered_user'), 0) AS weekly_user_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE actor_type = 'registered_user'), 0) AS total_user_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE occurred_at >= boundaries.week_start AND actor_type = 'admin'), 0) AS weekly_admin_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE actor_type = 'admin'), 0) AS total_admin_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE occurred_at >= boundaries.week_start AND actor_type = 'anonymous'), 0) AS weekly_anonymous_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE actor_type = 'anonymous'), 0) AS total_anonymous_ai_cost_usd,
            count(*) FILTER (WHERE estimated_cost_usd IS NULL)::bigint AS unpriced_usage_events
          FROM admin_ai_usage_events usage
          CROSS JOIN boundaries
        ), revenue AS (
          SELECT
            COALESCE(sum(amount_eur) FILTER (WHERE confirmed_at >= boundaries.week_start), 0) AS weekly_revenue_eur,
            COALESCE(sum(amount_eur), 0) AS total_revenue_eur
          FROM simulated_purchases
          CROSS JOIN boundaries
        )
        SELECT revenue.weekly_revenue_eur::text,
          revenue.total_revenue_eur::text,
          costs.weekly_ai_cost_usd::text,
          costs.total_ai_cost_usd::text,
          costs.weekly_user_ai_cost_usd::text,
          costs.total_user_ai_cost_usd::text,
          costs.weekly_admin_ai_cost_usd::text,
          costs.total_admin_ai_cost_usd::text,
          costs.weekly_anonymous_ai_cost_usd::text,
          costs.total_anonymous_ai_cost_usd::text,
          account_counts.registered_count::text AS registered_user_count,
          account_counts.admin_count::text AS admin_user_count,
          costs.unpriced_usage_events::text
        FROM revenue CROSS JOIN costs CROSS JOIN account_counts
      `),
      this.pool.query<{
        latest_event_id: string;
        error_code: string;
        weekly_count: string;
        total_count: string;
        last_occurred_at: Date;
        latest_diagnostic_code: string | null;
      }>(`
        WITH boundaries AS (
          SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')
            AT TIME ZONE 'Europe/Madrid' AS week_start
        )
        SELECT error_code,
          count(*) FILTER (WHERE occurred_at >= boundaries.week_start)::text AS weekly_count,
          count(*)::text AS total_count,
          max(occurred_at) AS last_occurred_at,
          (array_agg(id::text ORDER BY occurred_at DESC, id DESC))[1] AS latest_event_id,
          diagnostic_code AS latest_diagnostic_code
        FROM application_error_events CROSS JOIN boundaries
        GROUP BY error_code, diagnostic_code
        ORDER BY count(*) DESC, error_code ASC
        LIMIT 10
      `),
      this.pool.query<CostTrendRow>(`
        WITH bounds AS (
          SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Madrid') AS current_week
        ), weeks AS (
          SELECT week_start
          FROM bounds
          CROSS JOIN LATERAL generate_series(
            bounds.current_week - interval '7 weeks',
            bounds.current_week,
            interval '1 week'
          ) AS generated(week_start)
        ), weekly_costs AS (
          SELECT date_trunc('week', occurred_at AT TIME ZONE 'Europe/Madrid') AS week_start,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE actor_type = 'registered_user'), 0) AS registered_users_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE actor_type = 'admin'), 0) AS admins_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE actor_type = 'anonymous'), 0) AS anonymous_usd,
            COALESCE(sum(estimated_cost_usd), 0) AS total_usd
          FROM admin_ai_usage_events
          WHERE occurred_at >= (
            SELECT (current_week - interval '7 weeks') AT TIME ZONE 'Europe/Madrid' FROM bounds
          )
          GROUP BY 1
        )
        SELECT to_char(weeks.week_start, 'YYYY-MM-DD') AS week_start,
          COALESCE(weekly_costs.registered_users_usd, 0)::text AS registered_users_usd,
          COALESCE(weekly_costs.admins_usd, 0)::text AS admins_usd,
          COALESCE(weekly_costs.anonymous_usd, 0)::text AS anonymous_usd,
          COALESCE(weekly_costs.total_usd, 0)::text AS total_usd
        FROM weeks LEFT JOIN weekly_costs USING (week_start)
        ORDER BY weeks.week_start
      `),
    ]);
    const row = summary.rows[0];
    if (!row) throw new Error("Admin dashboard summary unavailable.");
    const registeredUserCount = Number(row.registered_user_count);
    const adminUserCount = Number(row.admin_user_count);
    const accountCount = registeredUserCount + adminUserCount;
    const totalUserCostUsd = Number(row.total_user_ai_cost_usd);
    const weeklyUserCostUsd = Number(row.weekly_user_ai_cost_usd);
    const totalAdminCostUsd = Number(row.total_admin_ai_cost_usd);
    const weeklyAdminCostUsd = Number(row.weekly_admin_ai_cost_usd);
    const toByActor = (
      registeredUsersUsd: string,
      adminsUsd: string,
      anonymousUsd: string,
    ) => ({
      registeredUsersUsd: Number(registeredUsersUsd),
      adminsUsd: Number(adminsUsd),
      anonymousUsd: Number(anonymousUsd),
    });
    return {
      revenue: {
        weeklyEur: Number(row.weekly_revenue_eur),
        totalEur: Number(row.total_revenue_eur),
      },
      estimatedAiCost: {
        weeklyUsd: Number(row.weekly_ai_cost_usd),
        totalUsd: Number(row.total_ai_cost_usd),
        weeklyAveragePerAccountUsd:
          accountCount === 0
            ? 0
            : (weeklyUserCostUsd + weeklyAdminCostUsd) / accountCount,
        totalAveragePerAccountUsd:
          accountCount === 0
            ? 0
            : (totalUserCostUsd + totalAdminCostUsd) / accountCount,
        activeRegisteredAccountCount: registeredUserCount,
        activeAdminAccountCount: adminUserCount,
        weeklyByActor: toByActor(
          row.weekly_user_ai_cost_usd,
          row.weekly_admin_ai_cost_usd,
          row.weekly_anonymous_ai_cost_usd,
        ),
        totalByActor: toByActor(
          row.total_user_ai_cost_usd,
          row.total_admin_ai_cost_usd,
          row.total_anonymous_ai_cost_usd,
        ),
        weeklyTrend: trendRows.rows.map((week) => ({
          weekStart: week.week_start,
          registeredUsersUsd: Number(week.registered_users_usd),
          adminsUsd: Number(week.admins_usd),
          anonymousUsd: Number(week.anonymous_usd),
          totalUsd: Number(week.total_usd),
        })),
        unpricedUsageEvents: Number(row.unpriced_usage_events),
      },
      errors: errorRows.rows.map((error) => ({
        latestEventId: error.latest_event_id,
        code: error.error_code,
        weeklyCount: Number(error.weekly_count),
        totalCount: Number(error.total_count),
        lastOccurredAt: error.last_occurred_at.toISOString(),
        latestDiagnosticCode: error.latest_diagnostic_code,
      })),
    };
  }

  async getApplicationError(
    id: string,
  ): Promise<AdminApplicationErrorDetail | null> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      id: string;
      error_code: string;
      status_code: number;
      occurred_at: Date;
      diagnostic_code: string | null;
      context_json: unknown;
    }>(
      `SELECT id::text, error_code, status_code, occurred_at,
          diagnostic_code, context_json
       FROM application_error_events WHERE id=$1::bigint`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      code: row.error_code,
      statusCode: row.status_code,
      occurredAt: row.occurred_at.toISOString(),
      diagnosticCode: row.diagnostic_code,
      context: parseApplicationErrorContext(row.context_json),
    };
  }

  async listContactMessages(): Promise<AdminContactMessage[]> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      id: string;
      subject: string;
      message: string;
      created_at: Date;
      username: string;
      email: string;
      reply_status: "sending" | "sent" | "previewed" | "uncertain" | null;
      reply_attempt_count: number | null;
      reply_last_attempt_at: Date | null;
    }>(
      `SELECT contact.id,contact.subject,contact.message,contact.created_at,
         user_account.username,user_account.email,
         admin_reply.status AS reply_status,
         admin_reply.attempt_count AS reply_attempt_count,
         admin_reply.last_attempt_at AS reply_last_attempt_at
       FROM contact_messages contact
       JOIN users user_account ON user_account.id=contact.user_id
       LEFT JOIN admin_contact_message_replies admin_reply
         ON admin_reply.contact_message_id=contact.id
       ORDER BY contact.created_at DESC,contact.id DESC LIMIT $1`,
      [CONTACT_MESSAGE_LIMIT],
    );
    return result.rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      message: row.message,
      createdAt: row.created_at.toISOString(),
      sender: { username: row.username, email: row.email },
      reply: {
        status: row.reply_status ?? "not_replied",
        attemptedAt: row.reply_last_attempt_at?.toISOString() ?? null,
        retryAllowed:
          row.reply_status === "uncertain" &&
          (row.reply_attempt_count ?? MAX_ADMIN_REPLY_ATTEMPTS) <
            MAX_ADMIN_REPLY_ATTEMPTS,
      },
    }));
  }

  async claimContactMessageReply(
    messageId: string,
    adminUserId: string,
    reviewedWebmail: boolean,
  ): Promise<ContactMessageReplyClaim | null> {
    await this.ensureSchema();
    const initial = await this.pool.query(
      `INSERT INTO admin_contact_message_replies
         (contact_message_id,admin_user_id,status,attempt_count,last_attempt_at)
       SELECT contact.id,$2,'sending',1,now()
       FROM contact_messages contact
       WHERE contact.id=$1
       ON CONFLICT (contact_message_id) DO NOTHING
       RETURNING contact_message_id`,
      [messageId, adminUserId],
    );
    let claimed = Boolean(initial.rowCount);
    if (!claimed && reviewedWebmail) {
      const retry = await this.pool.query(
        `UPDATE admin_contact_message_replies
         SET status='sending',admin_user_id=$2,
             attempt_count=attempt_count+1,last_attempt_at=now()
         WHERE contact_message_id=$1 AND status='uncertain'
           AND attempt_count < $3
         RETURNING contact_message_id`,
        [messageId, adminUserId, MAX_ADMIN_REPLY_ATTEMPTS],
      );
      claimed = Boolean(retry.rowCount);
    }
    const result = await this.pool.query<{
      id: string;
      subject: string;
      created_at: Date;
      email: string;
      status: "sending" | "sent" | "previewed" | "uncertain" | null;
      attempt_count: number;
      last_attempt_at: Date;
    }>(
      `SELECT contact.id,contact.subject,contact.created_at,
         user_account.email,admin_reply.status,admin_reply.attempt_count,
         admin_reply.last_attempt_at
       FROM contact_messages contact
       JOIN users user_account ON user_account.id=contact.user_id
       LEFT JOIN admin_contact_message_replies admin_reply
         ON admin_reply.contact_message_id=contact.id
       WHERE contact.id=$1`,
      [messageId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      subject: row.subject,
      createdAt: row.created_at.toISOString(),
      recipient: row.email,
      status: row.status ?? "not_replied",
      attemptedAt: row.last_attempt_at?.toISOString() ?? null,
      attemptCount: row.attempt_count ?? 0,
      claimed,
    };
  }

  async completeContactMessageReply(
    messageId: string,
    status: "sent" | "previewed" | "uncertain",
  ): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `UPDATE admin_contact_message_replies
       SET status=$2,sent_at=CASE WHEN $2='sent' THEN now() ELSE NULL END
       WHERE contact_message_id=$1 AND status='sending'`,
      [messageId, status],
    );
  }

  async recordAiUsage(record: AiUsageRecord): Promise<void> {
    await this.ensureSchema();
    const estimatedCostUsd = calculateEstimatedCostUsd(
      record.model,
      record.inputTokens,
      record.outputTokens,
    );
    await this.pool.query(
      `INSERT INTO admin_ai_usage_events
        (user_id,actor_type,operation,model,input_tokens,output_tokens,estimated_cost_usd)
       VALUES(
         $1,
         CASE
           WHEN $1::uuid IS NULL THEN 'anonymous'
           WHEN EXISTS (SELECT 1 FROM users WHERE id = $1::uuid AND role = 'admin') THEN 'admin'
           ELSE 'registered_user'
         END,
         $2,$3,$4,$5,$6
       )`,
      [
        record.userId ?? null,
        record.operation,
        record.model,
        record.inputTokens,
        record.outputTokens,
        estimatedCostUsd,
      ],
    );
  }

  async recordApplicationError(
    errorCode: string,
    statusCode: number,
    diagnosticCode?: string,
    context?: ApplicationErrorContext,
  ): Promise<void> {
    await this.ensureSchema();
    const normalizedCode = /^[A-Z0-9_]{1,100}$/u.test(errorCode)
      ? errorCode.slice(0, MAX_ERROR_CODE_LENGTH)
      : "UNCLASSIFIED_ERROR";
    const normalizedDiagnosticCode =
      diagnosticCode && /^[a-z][a-z0-9_]{0,99}$/u.test(diagnosticCode)
        ? diagnosticCode
        : null;
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599)
      return;
    const applicationErrorContext =
      normalizedCode === "INVALID_EVALUATION_RESPONSE" &&
      statusCode === 503 &&
      normalizedDiagnosticCode !== null
        ? parseApplicationErrorContext(context)
        : null;
    await this.pool.query(
      `INSERT INTO application_error_events
         (error_code,status_code,diagnostic_code,context_json)
       VALUES($1,$2,$3,$4::jsonb)`,
      [
        normalizedCode,
        statusCode,
        normalizedDiagnosticCode,
        applicationErrorContext
          ? JSON.stringify(applicationErrorContext)
          : null,
      ],
    );
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
  }
}
