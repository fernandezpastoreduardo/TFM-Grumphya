import { Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import {
  calculateEstimatedCostUsd,
  type AiUsageRecord,
} from "../infrastructure/ai/ai-usage";
import type {
  AdminContactMessage,
  AdminDashboardRepository,
  AdminDashboardSnapshot,
} from "./admin-dashboard.models";

const CONTACT_MESSAGE_LIMIT = 100;
const MAX_ERROR_CODE_LENGTH = 100;

type SnapshotRow = {
  weekly_revenue_eur: string;
  total_revenue_eur: string;
  weekly_ai_cost_usd: string;
  total_ai_cost_usd: string;
  weekly_user_ai_cost_usd: string;
  total_user_ai_cost_usd: string;
  registered_user_count: string;
  unpriced_usage_events: string;
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
    const [summary, errorRows] = await Promise.all([
      this.pool.query<SnapshotRow>(`
        WITH boundaries AS (
          SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')
            AT TIME ZONE 'Europe/Madrid' AS week_start
        ), user_count AS (
          SELECT count(*)::bigint AS count FROM users WHERE role = 'user' AND status = 'active'
        ), costs AS (
          SELECT
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE occurred_at >= boundaries.week_start), 0) AS weekly_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd), 0) AS total_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE occurred_at >= boundaries.week_start AND user_account.role = 'user'), 0) AS weekly_user_ai_cost_usd,
            COALESCE(sum(estimated_cost_usd) FILTER (WHERE user_account.role = 'user'), 0) AS total_user_ai_cost_usd,
            count(*) FILTER (WHERE estimated_cost_usd IS NULL)::bigint AS unpriced_usage_events
          FROM admin_ai_usage_events usage
          CROSS JOIN boundaries
          LEFT JOIN users user_account ON user_account.id = usage.user_id
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
          user_count.count::text AS registered_user_count,
          costs.unpriced_usage_events::text
        FROM revenue CROSS JOIN costs CROSS JOIN user_count
      `),
      this.pool.query<{
        error_code: string;
        weekly_count: string;
        total_count: string;
      }>(`
        WITH boundaries AS (
          SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')
            AT TIME ZONE 'Europe/Madrid' AS week_start
        )
        SELECT error_code,
          count(*) FILTER (WHERE occurred_at >= boundaries.week_start)::text AS weekly_count,
          count(*)::text AS total_count
        FROM application_error_events CROSS JOIN boundaries
        GROUP BY error_code
        ORDER BY count(*) DESC, error_code ASC
        LIMIT 10
      `),
    ]);
    const row = summary.rows[0];
    if (!row) throw new Error("Admin dashboard summary unavailable.");
    const registeredUserCount = Number(row.registered_user_count);
    const totalUserCostUsd = Number(row.total_user_ai_cost_usd);
    const weeklyUserCostUsd = Number(row.weekly_user_ai_cost_usd);
    return {
      revenue: {
        weeklyEur: Number(row.weekly_revenue_eur),
        totalEur: Number(row.total_revenue_eur),
      },
      estimatedAiCost: {
        weeklyUsd: Number(row.weekly_ai_cost_usd),
        totalUsd: Number(row.total_ai_cost_usd),
        weeklyAveragePerUserUsd:
          registeredUserCount === 0
            ? 0
            : weeklyUserCostUsd / registeredUserCount,
        totalAveragePerUserUsd:
          registeredUserCount === 0
            ? 0
            : totalUserCostUsd / registeredUserCount,
        registeredUserCount,
        unpricedUsageEvents: Number(row.unpriced_usage_events),
      },
      errors: errorRows.rows.map((error) => ({
        code: error.error_code,
        weeklyCount: Number(error.weekly_count),
        totalCount: Number(error.total_count),
      })),
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
    }>(
      `SELECT contact.id,contact.subject,contact.message,contact.created_at,
         user_account.username,user_account.email
       FROM contact_messages contact
       JOIN users user_account ON user_account.id=contact.user_id
       ORDER BY contact.created_at DESC,contact.id DESC LIMIT $1`,
      [CONTACT_MESSAGE_LIMIT],
    );
    return result.rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      message: row.message,
      createdAt: row.created_at.toISOString(),
      sender: { username: row.username, email: row.email },
    }));
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
        (user_id,operation,model,input_tokens,output_tokens,estimated_cost_usd)
       VALUES($1,$2,$3,$4,$5,$6)`,
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
  ): Promise<void> {
    await this.ensureSchema();
    const normalizedCode = /^[A-Z0-9_]{1,100}$/u.test(errorCode)
      ? errorCode.slice(0, MAX_ERROR_CODE_LENGTH)
      : "UNCLASSIFIED_ERROR";
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599)
      return;
    await this.pool.query(
      "INSERT INTO application_error_events(error_code,status_code) VALUES($1,$2)",
      [normalizedCode, statusCode],
    );
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
  }
}
