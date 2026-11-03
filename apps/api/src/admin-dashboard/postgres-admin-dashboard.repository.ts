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
  TokenVolumeBucket,
} from "./admin-dashboard.models";
import type { AnonymousAnalyticsSnapshot } from "../anonymous-analytics/anonymous-analytics.models";

const CONTACT_MESSAGE_LIMIT = 100;
const MAX_ERROR_CODE_LENGTH = 100;
const MAX_ADMIN_REPLY_ATTEMPTS = 2;
const DAILY_PLAN_ATTEMPTS = 11;
const ASSUMED_DAYS_PER_MONTH = 30;
const HOSTING_MONTHLY_EUR = 12;
const HOSTING_STARTS_MONTH = "2026-10";
// BCE reference rate on 2026-10-27: 1 EUR = 1.1150 USD.
// This is a fixed estimate, not the rate charged by the payment provider.
const USD_TO_EUR_RATE = 1 / 1.115;
const EXCHANGE_RATE_AS_OF = "2026-10-27";

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

type MaximumCostRow = {
  operation: "idea_evaluation" | "roast";
  average_usd: string;
  priced_attempts: string;
};

type ActivePlanRow = {
  week_start: string;
  iluminado: string;
  falton: string;
};

type AnnualFinanceRow = {
  month: string;
  revenue_eur: string;
  ai_cost_usd: string;
};

type RecentAiActivityRow = {
  hour: Date;
  operation: string;
  model: string;
  event_count: string;
  input_tokens: string;
  cached_input_tokens: string;
  output_tokens: string;
  estimated_cost_usd: string | null;
};

const SAFE_MODEL_PATTERN = /^[a-zA-Z0-9._:-]{1,100}$/u;

function safeNonNegativeInteger(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function bucketTokenVolume(value: number): TokenVolumeBucket {
  if (value < 1_000) return "under_1k";
  if (value < 5_000) return "1k_5k";
  if (value < 20_000) return "5k_20k";
  return "20k_plus";
}

@Injectable()
export class PostgresAdminDashboardRepository implements AdminDashboardRepository {
  private readonly pool: Pool;
  private ready?: Promise<void>;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async getSnapshot(): Promise<AdminDashboardSnapshot> {
    await this.ensureSchema();
    const [
      summary,
      errorRows,
      trendRows,
      maximumCostRows,
      activePlanRows,
      financeRows,
      recentAiActivityRows,
    ] = await Promise.all([
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
      this.pool.query<MaximumCostRow>(`
        SELECT operation,
          avg(estimated_cost_usd)::text AS average_usd,
          count(*)::text AS priced_attempts
        FROM admin_ai_usage_events
        WHERE actor_type = 'registered_user'
          AND operation IN ('idea_evaluation', 'roast')
          AND estimated_cost_usd IS NOT NULL
        GROUP BY operation
      `),
      this.pool.query<ActivePlanRow>(`
        WITH bounds AS (
          SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Madrid') AS current_week
        ), weeks AS (
          SELECT generated.week_start
          FROM bounds
          CROSS JOIN LATERAL generate_series(
            bounds.current_week - interval '7 weeks',
            bounds.current_week,
            interval '1 week'
          ) AS generated(week_start)
        )
        SELECT to_char(weeks.week_start, 'YYYY-MM-DD') AS week_start,
          count(DISTINCT subscription.user_id) FILTER (
            WHERE subscription.plan_code = 'ILUMINADO'
          )::text AS iluminado,
          count(DISTINCT subscription.user_id) FILTER (
            WHERE subscription.plan_code = 'FALTON'
          )::text AS falton
        FROM weeks
        LEFT JOIN subscriptions subscription ON
          subscription.status IN ('active', 'expired')
          AND subscription.starts_at <= now()
          AND subscription.starts_at < ((
            weeks.week_start + interval '1 week'
          ) AT TIME ZONE 'Europe/Madrid')
          AND subscription.expires_at > (
            weeks.week_start AT TIME ZONE 'Europe/Madrid'
          )
        GROUP BY weeks.week_start
        ORDER BY weeks.week_start
      `),
      this.pool.query<AnnualFinanceRow>(`
        WITH bounds AS (
          SELECT date_trunc('year', now() AT TIME ZONE 'Europe/Madrid') AS year_start,
            date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AS current_month
        ), months AS (
          SELECT generated.month_start
          FROM bounds
          CROSS JOIN LATERAL generate_series(
            bounds.year_start,
            bounds.current_month,
            interval '1 month'
          ) AS generated(month_start)
        ), revenue AS (
          SELECT date_trunc('month', confirmed_at AT TIME ZONE 'Europe/Madrid') AS month_start,
            sum(amount_eur) AS revenue_eur
          FROM simulated_purchases CROSS JOIN bounds
          WHERE status = 'confirmed'
            AND confirmed_at >= (bounds.year_start AT TIME ZONE 'Europe/Madrid')
            AND confirmed_at <= now()
          GROUP BY 1
        ), ai_cost AS (
          SELECT date_trunc('month', occurred_at AT TIME ZONE 'Europe/Madrid') AS month_start,
            sum(estimated_cost_usd) AS ai_cost_usd
          FROM admin_ai_usage_events CROSS JOIN bounds
          WHERE occurred_at >= (bounds.year_start AT TIME ZONE 'Europe/Madrid')
            AND occurred_at <= now()
          GROUP BY 1
        )
        SELECT to_char(months.month_start, 'YYYY-MM') AS month,
          COALESCE(revenue.revenue_eur, 0)::text AS revenue_eur,
          COALESCE(ai_cost.ai_cost_usd, 0)::text AS ai_cost_usd
        FROM months
        LEFT JOIN revenue USING (month_start)
        LEFT JOIN ai_cost USING (month_start)
        ORDER BY months.month_start
      `),
      this.pool.query<RecentAiActivityRow>(`
        SELECT date_trunc('hour', occurred_at) AS hour,
          operation, model, count(*)::text AS event_count,
          COALESCE(sum(input_tokens), 0)::text AS input_tokens,
          COALESCE(sum(cached_input_tokens), 0)::text AS cached_input_tokens,
          COALESCE(sum(output_tokens), 0)::text AS output_tokens,
          sum(estimated_cost_usd)::text AS estimated_cost_usd
        FROM admin_ai_usage_events
        WHERE occurred_at >= now() - interval '24 hours'
          AND operation IN ('idea_evaluation', 'roast')
        GROUP BY 1, operation, model
        HAVING count(*) >= 3
        ORDER BY hour DESC, operation ASC, model ASC
        LIMIT 100
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
    const maximumFor = (operation: MaximumCostRow["operation"]) => {
      const cost = maximumCostRows.rows.find(
        (item) => item.operation === operation,
      );
      const averagePerAttemptUsd = cost ? Number(cost.average_usd) : null;
      return {
        averagePerAttemptUsd,
        monthlyMaximumUsd:
          averagePerAttemptUsd === null
            ? null
            : Math.round(
                averagePerAttemptUsd *
                  DAILY_PLAN_ATTEMPTS *
                  ASSUMED_DAYS_PER_MONTH *
                  1e10,
              ) / 1e10,
        pricedAttempts: cost ? Number(cost.priced_attempts) : 0,
      };
    };
    const months = financeRows.rows.map((month) => {
      const revenueEur = Number(month.revenue_eur);
      const aiCostUsd = Number(month.ai_cost_usd);
      const aiCostEur = aiCostUsd * USD_TO_EUR_RATE;
      const hostingEur =
        month.month >= HOSTING_STARTS_MONTH ? HOSTING_MONTHLY_EUR : 0;
      const expensesEur = aiCostEur + hostingEur;
      return {
        month: month.month,
        revenueEur,
        aiCostUsd,
        aiCostEur,
        hostingEur,
        expensesEur,
        netEur: revenueEur - expensesEur,
      };
    });
    return {
      recentAiActivity: recentAiActivityRows.rows.flatMap((activity) => {
        if (
          !(activity.hour instanceof Date) ||
          !Number.isFinite(activity.hour.getTime()) ||
          (activity.operation !== "idea_evaluation" &&
            activity.operation !== "roast") ||
          !SAFE_MODEL_PATTERN.test(activity.model)
        ) {
          return [];
        }
        const inputTokens = safeNonNegativeInteger(activity.input_tokens);
        const cachedInputTokens = safeNonNegativeInteger(
          activity.cached_input_tokens,
        );
        const outputTokens = safeNonNegativeInteger(activity.output_tokens);
        const parsedCost =
          activity.estimated_cost_usd === null
            ? null
            : Number(activity.estimated_cost_usd);
        return [
          {
            hour: activity.hour.toISOString(),
            operation: activity.operation,
            model: activity.model,
            eventCount: safeNonNegativeInteger(activity.event_count),
            inputTokenBucket: bucketTokenVolume(inputTokens),
            cachedInputTokenBucket: bucketTokenVolume(cachedInputTokens),
            outputTokenBucket: bucketTokenVolume(outputTokens),
            estimatedCostUsd:
              parsedCost !== null &&
              Number.isFinite(parsedCost) &&
              parsedCost >= 0
                ? parsedCost
                : null,
          },
        ];
      }),
      loginSecurity: {
        windowMinutes: 15,
        loginRequests: 0,
        challengesIssued: 0,
        challengesAccepted: 0,
        challengesRejected: 0,
        failedLogins: 0,
        blockedRequests: 0,
        activeBlockedAddresses: 0,
        attackModeActive: false,
      },
      revenue: {
        weeklyEur: Number(row.weekly_revenue_eur),
        totalEur: Number(row.total_revenue_eur),
      },
      maximumMonthlyCost: {
        iluminado: maximumFor("idea_evaluation"),
        falton: maximumFor("roast"),
        dailyAttempts: DAILY_PLAN_ATTEMPTS,
        assumedDaysPerMonth: ASSUMED_DAYS_PER_MONTH,
      },
      weeklyActivePlans: activePlanRows.rows.map((week) => ({
        weekStart: week.week_start,
        iluminado: Number(week.iluminado),
        falton: Number(week.falton),
      })),
      annualFinance: {
        year: Number(
          months[0]?.month.slice(0, 4) ??
            new Intl.DateTimeFormat("en-GB", {
              year: "numeric",
              timeZone: "Europe/Madrid",
            }).format(new Date()),
        ),
        hostingMonthlyEur: HOSTING_MONTHLY_EUR,
        hostingStartsMonth: HOSTING_STARTS_MONTH,
        usdToEurRate: USD_TO_EUR_RATE,
        exchangeRateSource: "BCE",
        exchangeRateAsOf: EXCHANGE_RATE_AS_OF,
        months,
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

  async getAnonymousAnalytics(): Promise<AnonymousAnalyticsSnapshot> {
    await this.ensureSchema();
    const [
      viewsByPage,
      deviceShares,
      monthlyPlanSelections,
      monthlyPlanActivations,
    ] = await Promise.all([
      this.pool.query<{ page_code: string; event_count: string }>(`
          WITH page_counts AS (
            SELECT page_code, sum(event_count)::bigint AS event_count
            FROM anonymous_analytics_daily
            WHERE event_name = 'page_view'
              AND metric_date >= (now() AT TIME ZONE 'Europe/Madrid')::date - 30
              AND metric_date < (now() AT TIME ZONE 'Europe/Madrid')::date
            GROUP BY page_code
          )
          SELECT page_code, event_count::text AS event_count
          FROM (
            SELECT page_code, event_count
            FROM page_counts WHERE event_count >= 10
            UNION ALL
            SELECT 'other_public_pages' AS page_code, sum(event_count) AS event_count
            FROM page_counts WHERE event_count < 10
            HAVING sum(event_count) >= 10
          ) AS visible_pages
          ORDER BY event_count::bigint DESC, page_code
        `),
      this.pool.query<{ device_class: string; event_count: string }>(`
          SELECT device_class, sum(event_count)::text AS event_count
          FROM anonymous_analytics_daily
          WHERE event_name = 'page_view'
            AND metric_date >= (now() AT TIME ZONE 'Europe/Madrid')::date - 30
            AND metric_date < (now() AT TIME ZONE 'Europe/Madrid')::date
          GROUP BY device_class
          HAVING sum(event_count) >= 10
          ORDER BY device_class
        `),
      this.pool.query<{
        month: string;
        plan_code: string;
        event_count: string;
      }>(`
          SELECT to_char(date_trunc('month', metric_date), 'YYYY-MM') AS month,
            plan_code, sum(event_count)::text AS event_count
          FROM anonymous_analytics_daily
          WHERE event_name = 'plan_selection'
            AND metric_date >= date_trunc('month', (now() AT TIME ZONE 'Europe/Madrid'))::date - interval '6 months'
            AND metric_date < date_trunc('month', now() AT TIME ZONE 'Europe/Madrid')::date
          GROUP BY date_trunc('month', metric_date), plan_code
          HAVING sum(event_count) >= 10
          ORDER BY date_trunc('month', metric_date), plan_code
        `),
      this.pool.query<{
        month: string;
        plan_code: string;
        purchase_count: string;
      }>(`
          SELECT to_char(date_trunc('month', purchase.confirmed_at AT TIME ZONE 'Europe/Madrid'), 'YYYY-MM') AS month,
            subscription.plan_code, count(*)::text AS purchase_count
          FROM simulated_purchases purchase
          JOIN subscriptions subscription ON subscription.id = purchase.subscription_id
          WHERE purchase.status = 'confirmed'
            AND purchase.confirmed_at >= (date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') - interval '6 months') AT TIME ZONE 'Europe/Madrid'
            AND purchase.confirmed_at < date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'
          GROUP BY date_trunc('month', purchase.confirmed_at AT TIME ZONE 'Europe/Madrid'), subscription.plan_code
          HAVING count(*) >= 10
          ORDER BY date_trunc('month', purchase.confirmed_at AT TIME ZONE 'Europe/Madrid'), subscription.plan_code
        `),
    ]);

    const toPage = (code: string) =>
      code === "other_public_pages" ||
      code === "home" ||
      code === "precios" ||
      code === "buenas-practicas" ||
      code === "humanos-notables" ||
      code === "lo-peor-de-lo-peor" ||
      code === "contacto" ||
      code === "descargate"
        ? code
        : null;
    const toPlan = (code: string) =>
      code === "ILUMINADO" || code === "FALTON" ? code : null;
    const deviceCounts = deviceShares.rows.flatMap((row) => {
      if (row.device_class !== "mobile" && row.device_class !== "desktop")
        return [];
      return [{ device: row.device_class, count: Number(row.event_count) }];
    });
    const deviceTotal = deviceCounts.reduce(
      (total, row) => total + row.count,
      0,
    );
    const roundedMobilePercentage =
      deviceTotal > 0
        ? Math.round(
            ((deviceCounts.find((row) => row.device === "mobile")?.count ?? 0) /
              deviceTotal) *
              20,
          ) * 5
        : 0;
    const visibleDeviceShares: AnonymousAnalyticsSnapshot["deviceShares"] =
      deviceCounts.length === 2
        ? [
            { device: "mobile", percentage: roundedMobilePercentage },
            { device: "desktop", percentage: 100 - roundedMobilePercentage },
          ]
        : [];
    return {
      viewsByPage: viewsByPage.rows.flatMap((row) => {
        const page = toPage(row.page_code);
        return page ? [{ page, count: Number(row.event_count) }] : [];
      }),
      deviceShares: visibleDeviceShares,
      monthlyPlanSelections: monthlyPlanSelections.rows.flatMap((row) => {
        const plan = toPlan(row.plan_code);
        return plan
          ? [{ month: row.month, plan, count: Number(row.event_count) }]
          : [];
      }),
      monthlyPlanActivations: monthlyPlanActivations.rows.flatMap((row) => {
        const plan = toPlan(row.plan_code);
        return plan
          ? [{ month: row.month, plan, count: Number(row.purchase_count) }]
          : [];
      }),
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
    }>(
      `SELECT id::text, error_code, status_code, occurred_at,
          diagnostic_code
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
      context: null,
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
      record.cachedInputTokens ?? 0,
    );
    await this.pool.query(
      `INSERT INTO admin_ai_usage_events
        (user_id,actor_type,operation,model,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd)
       VALUES(
         $1,
         CASE
           WHEN $1::uuid IS NULL THEN 'anonymous'
           WHEN EXISTS (SELECT 1 FROM users WHERE id = $1::uuid AND role = 'admin') THEN 'admin'
           ELSE 'registered_user'
         END,
         $2,$3,$4,$5,$6,$7
       )`,
      [
        record.userId ?? null,
        record.operation,
        record.model,
        record.inputTokens,
        record.cachedInputTokens ?? 0,
        record.outputTokens,
        estimatedCostUsd,
      ],
    );
  }

  async recordApplicationError(
    errorCode: string,
    statusCode: number,
    diagnosticCode?: string,
    _context?: unknown,
  ): Promise<void> {
    void _context;
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
    await this.pool.query(
      `INSERT INTO application_error_events
         (error_code,status_code,diagnostic_code)
       VALUES($1,$2,$3)`,
      [normalizedCode, statusCode, normalizedDiagnosticCode],
    );
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
  }
}
