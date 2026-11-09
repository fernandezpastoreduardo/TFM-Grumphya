import { createHmac } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { withTransaction } from "../infrastructure/database/with-transaction";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type {
  AnonymousQuota,
  AnonymousUsageRepository,
  AnonymousUsageScope,
  AnonymousUsageState,
  ReservationResult,
} from "./anonymous-usage.models";

const USAGE_LIMIT = 3;
const IDEMPOTENCY_TTL_HOURS = 24;
const PROFILE_ISSUE_LIMIT = 20;
const PROFILE_ISSUE_WINDOW_HOURS = 24;

type CounterRow = {
  scope: AnonymousUsageScope;
  used_count: number;
  reserved_count: number;
};
type ReservationRow = {
  request_hash: string;
  state: string;
  response_json: unknown;
};

export class AnonymousIpLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Anonymous profile creation limit exceeded.");
    this.name = "AnonymousIpLimitError";
  }
}

export class PostgresAnonymousUsageRepository implements AnonymousUsageRepository {
  private ready?: Promise<void>;

  constructor(
    private readonly pool: Pick<Pool, "query" | "connect">,
    private readonly migrationRunner: (
      pool: Pool,
    ) => Promise<void> = runMigrations,
  ) {}

  async initialize(tokenHash: string, ipHmac: string): Promise<boolean> {
    await this.ensureSchema();
    return withTransaction(this.pool, async (client) => {
      await client.query(
        "DELETE FROM anonymous_usage_requests WHERE expires_at <= now()",
      );
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM anonymous_visitors WHERE token_hash = $1 FOR UPDATE",
        [tokenHash],
      );
      if (existing.rowCount) {
        await client.query(
          "UPDATE anonymous_visitors SET last_seen_at = now() WHERE id = $1",
          [existing.rows[0]!.id],
        );
        return false;
      }

      await client.query(
        "DELETE FROM anonymous_ip_activity WHERE expires_at <= now()",
      );
      const activity = await client.query<{
        profiles_created: number;
        retry_after_seconds: number | string;
      }>(
        `INSERT INTO anonymous_ip_activity (ip_hmac, window_started_at, profiles_created, expires_at)
         VALUES ($1, now(), 1, now() + interval '${PROFILE_ISSUE_WINDOW_HOURS} hours')
         ON CONFLICT (ip_hmac) DO UPDATE
         SET profiles_created = CASE
               WHEN anonymous_ip_activity.expires_at <= now() THEN 1
               ELSE anonymous_ip_activity.profiles_created + 1
             END,
             window_started_at = CASE
               WHEN anonymous_ip_activity.expires_at <= now() THEN now()
               ELSE anonymous_ip_activity.window_started_at
             END,
             expires_at = CASE
               WHEN anonymous_ip_activity.expires_at <= now()
                 THEN now() + interval '${PROFILE_ISSUE_WINDOW_HOURS} hours'
               ELSE anonymous_ip_activity.expires_at
             END
         RETURNING profiles_created,
           GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - now()))) AS retry_after_seconds`,
        [ipHmac],
      );
      const activityRow = activity.rows[0];
      if (Number(activityRow?.profiles_created) > PROFILE_ISSUE_LIMIT) {
        const retryAfterSeconds = Number(activityRow!.retry_after_seconds);
        throw new AnonymousIpLimitError(retryAfterSeconds);
      }
      await client.query(
        "INSERT INTO anonymous_visitors (token_hash) VALUES ($1)",
        [tokenHash],
      );
      return true;
    });
  }

  async getUsage(tokenHash: string): Promise<AnonymousUsageState | null> {
    await this.ensureSchema();
    const visitor = await this.pool.query<{ id: string }>(
      "UPDATE anonymous_visitors SET last_seen_at = now() WHERE token_hash = $1 RETURNING id",
      [tokenHash],
    );
    if (!visitor.rowCount) return null;
    return this.readUsage(visitor.rows[0]!.id);
  }

  async reserve(
    tokenHash: string,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<ReservationResult> {
    await this.ensureSchema();
    return withTransaction(this.pool, async (client) => {
      await client.query(
        "DELETE FROM anonymous_usage_requests WHERE expires_at <= now()",
      );
      const visitorId = await this.requireVisitor(client, tokenHash);
      await client.query(
        `INSERT INTO anonymous_usage_counters (visitor_id, scope)
         VALUES ($1, $2) ON CONFLICT (visitor_id, scope) DO NOTHING`,
        [visitorId, scope],
      );
      const existing = await client.query<ReservationRow>(
        `SELECT request_hash, state, response_json FROM anonymous_usage_requests
         WHERE visitor_id = $1 AND scope = $2 AND idempotency_hash = $3
           AND expires_at > now() FOR UPDATE`,
        [visitorId, scope, idempotencyHash],
      );
      if (existing.rowCount) {
        const row = existing.rows[0]!;
        if (row.request_hash !== requestHash)
          throw new Error("IDEMPOTENCY_CONFLICT");
        if (row.state === "committed") {
          return {
            state: "cached",
            response: row.response_json,
            usage: await this.readUsageInTransaction(client, visitorId),
          };
        }
        if (row.state === "reserved") throw new Error("REQUEST_IN_PROGRESS");
        await client.query(
          `UPDATE anonymous_usage_requests SET state = 'reserved', response_json = NULL,
           expires_at = now() + interval '${IDEMPOTENCY_TTL_HOURS} hours'
           WHERE visitor_id = $1 AND scope = $2 AND idempotency_hash = $3`,
          [visitorId, scope, idempotencyHash],
        );
      } else {
        await client.query(
          `INSERT INTO anonymous_usage_requests (visitor_id, scope, idempotency_hash, request_hash, state, expires_at)
           VALUES ($1, $2, $3, $4, 'reserved', now() + interval '${IDEMPOTENCY_TTL_HOURS} hours')
           ON CONFLICT (visitor_id, scope, idempotency_hash) DO UPDATE SET
             request_hash = EXCLUDED.request_hash, state = 'reserved', response_json = NULL,
             expires_at = EXCLUDED.expires_at
           WHERE anonymous_usage_requests.expires_at <= now()`,
          [visitorId, scope, idempotencyHash, requestHash],
        );
      }
      const counter = await client.query<CounterRow>(
        `SELECT scope, used_count, reserved_count FROM anonymous_usage_counters
         WHERE visitor_id = $1 AND scope = $2 FOR UPDATE`,
        [visitorId, scope],
      );
      const row = counter.rows[0]!;
      if (row.used_count + row.reserved_count >= USAGE_LIMIT)
        throw new Error("ANONYMOUS_QUOTA_EXHAUSTED");
      await client.query(
        `UPDATE anonymous_usage_counters SET reserved_count = reserved_count + 1
         WHERE visitor_id = $1 AND scope = $2`,
        [visitorId, scope],
      );
      return {
        state: "reserved",
        usage: await this.readUsageInTransaction(client, visitorId),
      };
    });
  }

  async commit(
    tokenHash: string,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
    requestHash: string,
    response: unknown,
  ): Promise<AnonymousUsageState> {
    await this.ensureSchema();
    return withTransaction(this.pool, async (client) => {
      const visitorId = await this.requireVisitor(client, tokenHash);
      const request = await client.query(
        `UPDATE anonymous_usage_requests SET state = 'committed', response_json = $5
         WHERE visitor_id = $1 AND scope = $2 AND idempotency_hash = $3
           AND request_hash = $4 AND state = 'reserved' AND expires_at > now()
         RETURNING idempotency_hash`,
        [
          visitorId,
          scope,
          idempotencyHash,
          requestHash,
          JSON.stringify(response),
        ],
      );
      if (request.rowCount !== 1)
        throw new Error("USAGE_RESERVATION_UNAVAILABLE");
      const counter = await client.query(
        `UPDATE anonymous_usage_counters SET reserved_count = reserved_count - 1,
             used_count = used_count + 1
         WHERE visitor_id = $1 AND scope = $2 AND reserved_count > 0
         RETURNING visitor_id`,
        [visitorId, scope],
      );
      if (counter.rowCount !== 1) throw new Error("USAGE_COUNTER_UNAVAILABLE");
      return this.readUsageInTransaction(client, visitorId);
    });
  }

  async release(
    tokenHash: string,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
  ): Promise<void> {
    await this.ensureSchema();
    await withTransaction(this.pool, async (client) => {
      const visitorId = await this.requireVisitor(client, tokenHash);
      const released = await client.query(
        `UPDATE anonymous_usage_requests SET state = 'released', response_json = NULL
         WHERE visitor_id = $1 AND scope = $2 AND idempotency_hash = $3
           AND state = 'reserved' RETURNING visitor_id`,
        [visitorId, scope, idempotencyHash],
      );
      if (released.rowCount) {
        await client.query(
          `UPDATE anonymous_usage_counters SET reserved_count = GREATEST(0, reserved_count - 1)
           WHERE visitor_id = $1 AND scope = $2`,
          [visitorId, scope],
        );
      }
    });
  }

  private async requireVisitor(
    client: PoolClient,
    tokenHash: string,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      "UPDATE anonymous_visitors SET last_seen_at=now()\n       WHERE token_hash = $1 RETURNING id",
      [tokenHash],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("ANONYMOUS_VISITOR_NOT_FOUND");
    return id;
  }

  private async readUsage(visitorId: string): Promise<AnonymousUsageState> {
    const result = await this.pool.query<CounterRow>(
      "SELECT scope, used_count, reserved_count FROM anonymous_usage_counters WHERE visitor_id = $1",
      [visitorId],
    );
    return this.toUsage(result.rows);
  }

  private async readUsageInTransaction(
    client: PoolClient,
    visitorId: string,
  ): Promise<AnonymousUsageState> {
    const result = await client.query<CounterRow>(
      "SELECT scope, used_count, reserved_count FROM anonymous_usage_counters WHERE visitor_id = $1",
      [visitorId],
    );
    return this.toUsage(result.rows);
  }

  private toUsage(rows: CounterRow[]): AnonymousUsageState {
    const quota = (scope: AnonymousUsageScope): AnonymousQuota => {
      const row = rows.find((item) => item.scope === scope);
      const used =
        Number(row?.used_count ?? 0) + Number(row?.reserved_count ?? 0);
      return { limit: 3, used, remaining: Math.max(0, 3 - used) };
    };
    return { ideas: quota("ideas"), roasts: quota("roasts") };
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.migrationRunner(this.pool as Pool);
    await this.ready;
  }
}

export function hashAnonymousIp(ip: string, secret: string): string {
  if (!secret.trim())
    throw new Error("ANONYMOUS_IP_HMAC_SECRET must be configured.");
  return createHmac("sha256", secret).update(ip).digest("hex");
}
