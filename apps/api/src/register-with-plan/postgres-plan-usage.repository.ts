import { Pool, type PoolClient } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type {
  PlanUsageRepository,
  PlanUsageReservation,
  PlanUsageScope,
} from "./plan-usage.models";

const RESERVATION_TTL_MINUTES = 30;
const JAPPY_ADMIN_USERNAME = "jappy";
const IDEMPOTENCY_TTL_HOURS = 24;
const PLAN_FOR_SCOPE = { ideas: "ILUMINADO", roasts: "FALTON" } as const;
const COUNTER_FOR_SCOPE = {
  ideas: "ideas_used",
  roasts: "roasts_used",
} as const;
const LIMIT_FOR_SCOPE = {
  ideas: "ideas_per_day",
  roasts: "roasts_per_day",
} as const;

type RequestRow = {
  request_hash: string;
  state: "reserved" | "committed" | "released";
  response_json: unknown;
};

export class PostgresPlanUsageRepository implements PlanUsageRepository {
  private readonly pool: Pool;
  private ready?: Promise<void>;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async reserve(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<PlanUsageReservation> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      await client.query(
        `WITH expired AS (
           SELECT user_id,plan_code,idempotency_hash
           FROM account_plan_usage_requests WHERE expires_at <= now()
           ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
         )
         DELETE FROM account_plan_usage_requests request
         USING expired WHERE request.user_id=expired.user_id
           AND request.plan_code=expired.plan_code
           AND request.idempotency_hash=expired.idempotency_hash`,
      );
      const active = await client.query<{
        usage_limit: number;
        role: string;
        username_normalized: string;
      }>(
        `SELECT u.role,u.username_normalized,COALESCE(p.${LIMIT_FOR_SCOPE[scope]},0) AS usage_limit
         FROM users u
         LEFT JOIN LATERAL (
           SELECT s.plan_code FROM subscriptions s
           WHERE s.user_id=u.id AND s.plan_code=$2 AND s.status='active'
             AND s.starts_at <= now() AND s.expires_at > now()
           ORDER BY s.starts_at DESC LIMIT 1
         ) active_plan ON true
         LEFT JOIN plans p ON p.code=active_plan.plan_code
         WHERE u.id=$1 AND u.status='active' FOR SHARE OF u`,
        [userId, PLAN_FOR_SCOPE[scope]],
      );
      const limit = Number(active.rows[0]?.usage_limit ?? 0);
      const isAdmin =
        active.rows[0]?.role === "admin" &&
        active.rows[0]?.username_normalized === JAPPY_ADMIN_USERNAME;
      if (!isAdmin && limit < 1) throw new Error("ACTIVE_PLAN_REQUIRED");

      const date = await client.query<{ usage_date: string }>(
        "SELECT (now() AT TIME ZONE 'Europe/Madrid')::date::text AS usage_date",
      );
      const usageDate = date.rows[0]?.usage_date;
      if (!usageDate) throw new Error("PLAN_USAGE_DATE_UNAVAILABLE");
      if (!isAdmin)
        await client.query(
          `INSERT INTO account_daily_plan_usage(user_id,plan_code,usage_date,ideas_used,roasts_used)
         VALUES($1,$2,$3,0,0) ON CONFLICT(user_id,plan_code,usage_date) DO NOTHING`,
          [userId, PLAN_FOR_SCOPE[scope], usageDate],
        );
      const usage = isAdmin
        ? { rows: [{ used: 0 }] }
        : await client.query<{ used: number }>(
            `SELECT ${COUNTER_FOR_SCOPE[scope]} AS used FROM account_daily_plan_usage
         WHERE user_id=$1 AND plan_code=$2 AND usage_date=$3 FOR UPDATE`,
            [userId, PLAN_FOR_SCOPE[scope], usageDate],
          );
      const used = Number(usage.rows[0]?.used ?? 0);

      const reservations = await client.query<RequestRow>(
        `SELECT request_hash,state,response_json FROM account_plan_usage_requests
         WHERE user_id=$1 AND plan_code=$2 AND idempotency_hash=$3
           AND expires_at > now() FOR UPDATE`,
        [userId, PLAN_FOR_SCOPE[scope], idempotencyHash],
      );
      const prior = reservations.rows[0];
      if (prior) {
        if (prior.request_hash !== requestHash)
          throw new Error("IDEMPOTENCY_CONFLICT");
        if (prior.state === "committed")
          return { state: "cached", response: prior.response_json };
        if (prior.state === "reserved") {
          const freshness = await client.query<{ fresh: boolean }>(
            `SELECT reserved_at > now() - interval '${RESERVATION_TTL_MINUTES} minutes' AS fresh
             FROM account_plan_usage_requests
             WHERE user_id=$1 AND plan_code=$2 AND idempotency_hash=$3`,
            [userId, PLAN_FOR_SCOPE[scope], idempotencyHash],
          );
          if (freshness.rows[0]?.fresh) throw new Error("REQUEST_IN_PROGRESS");
        }
      }

      const otherReservations = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM account_plan_usage_requests
         WHERE user_id=$1 AND plan_code=$2 AND usage_date=$3 AND state='reserved'
           AND reserved_at > now() - interval '${RESERVATION_TTL_MINUTES} minutes'
           AND idempotency_hash <> $4`,
        [userId, PLAN_FOR_SCOPE[scope], usageDate, idempotencyHash],
      );
      if (
        !isAdmin &&
        used + Number(otherReservations.rows[0]?.count ?? 0) >= limit
      )
        throw new Error("PLAN_QUOTA_EXHAUSTED");

      await client.query(
        `INSERT INTO account_plan_usage_requests(user_id,plan_code,usage_date,idempotency_hash,request_hash,state,response_json,reserved_at,expires_at)
         VALUES($1,$2,$3,$4,$5,'reserved',NULL,now(),now()+interval '${IDEMPOTENCY_TTL_HOURS} hours')
         ON CONFLICT(user_id,plan_code,idempotency_hash) DO UPDATE SET
           request_hash=EXCLUDED.request_hash,state='reserved',response_json=NULL,
           reserved_at=now(),expires_at=EXCLUDED.expires_at`,
        [
          userId,
          PLAN_FOR_SCOPE[scope],
          usageDate,
          idempotencyHash,
          requestHash,
        ],
      );
      return { state: "reserved" };
    });
  }

  async commit(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
    requestHash: string,
    response: unknown,
  ): Promise<void> {
    await this.ensureSchema();
    await this.transaction(async (client) => {
      const active = await client.query<{
        role: string;
        username_normalized: string;
        has_active_plan: boolean;
      }>(
        `SELECT u.role,u.username_normalized,EXISTS (
           SELECT 1 FROM subscriptions s WHERE s.user_id=u.id AND s.plan_code=$2
             AND s.status='active' AND s.starts_at <= now() AND s.expires_at > now()
         ) AS has_active_plan FROM users u WHERE u.id=$1 AND u.status='active' FOR SHARE OF u`,
        [userId, PLAN_FOR_SCOPE[scope]],
      );
      const isAdmin =
        active.rows[0]?.role === "admin" &&
        active.rows[0]?.username_normalized === JAPPY_ADMIN_USERNAME;
      if (
        !active.rowCount ||
        (!isAdmin && active.rows[0]?.has_active_plan !== true)
      )
        throw new Error("ACTIVE_PLAN_REQUIRED");
      const request = await client.query<{ usage_date: string }>(
        `UPDATE account_plan_usage_requests SET state='committed',response_json=$5
         WHERE user_id=$1 AND plan_code=$2 AND idempotency_hash=$3 AND request_hash=$4
           AND state='reserved' AND expires_at > now()
         RETURNING usage_date::text AS usage_date`,
        [
          userId,
          PLAN_FOR_SCOPE[scope],
          idempotencyHash,
          requestHash,
          JSON.stringify(response),
        ],
      );
      const usageDate = request.rows[0]?.usage_date;
      if (!usageDate) throw new Error("PLAN_USAGE_RESERVATION_UNAVAILABLE");
      if (isAdmin) {
        if (scope === "roasts")
          await this.recordRoastMessageEvent(client, userId, idempotencyHash);
        return;
      }
      const updated = await client.query(
        `UPDATE account_daily_plan_usage SET ${COUNTER_FOR_SCOPE[scope]}=${COUNTER_FOR_SCOPE[scope]}+1,updated_at=now()
         WHERE user_id=$1 AND plan_code=$2 AND usage_date=$3
         AND ${COUNTER_FOR_SCOPE[scope]} < (SELECT ${LIMIT_FOR_SCOPE[scope]} FROM plans WHERE code=$2)`,
        [userId, PLAN_FOR_SCOPE[scope], usageDate],
      );
      if (updated.rowCount !== 1) throw new Error("PLAN_QUOTA_EXHAUSTED");
      if (scope === "roasts") {
        await this.recordRoastMessageEvent(client, userId, idempotencyHash);
      }
    });
  }

  async recordHistoricalRoastMessage(
    userId: string,
    idempotencyHash: string,
  ): Promise<void> {
    await this.ensureSchema();
    await this.transaction((client) =>
      this.recordRoastMessageEvent(client, userId, idempotencyHash),
    );
  }

  async release(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
  ): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `UPDATE account_plan_usage_requests SET state='released',response_json=NULL
       WHERE user_id=$1 AND plan_code=$2 AND idempotency_hash=$3 AND state='reserved'`,
      [userId, PLAN_FOR_SCOPE[scope], idempotencyHash],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordRoastMessageEvent(
    client: PoolClient,
    userId: string,
    idempotencyHash: string,
  ): Promise<void> {
    const inserted = await client.query(
      `INSERT INTO account_roast_message_events(user_id,idempotency_hash)
       SELECT $1,$2 WHERE EXISTS (
         SELECT 1 FROM users WHERE id=$1 AND status='active'
           AND ((role='admin' AND username_normalized=$3) OR (role='user' AND EXISTS (
             SELECT 1 FROM subscriptions s
             WHERE s.user_id=$1 AND s.plan_code='FALTON'
               AND s.status IN ('active','expired','cancelled')
               AND s.starts_at <= now()
           )))
       ) ON CONFLICT(user_id,idempotency_hash) DO NOTHING
       RETURNING user_id`,
      [userId, idempotencyHash, JAPPY_ADMIN_USERNAME],
    );
    if (inserted.rowCount === 1) {
      await client.query(
        "UPDATE users SET roast_messages_sent=roast_messages_sent+1 WHERE id=$1",
        [userId],
      );
    }
  }
}
