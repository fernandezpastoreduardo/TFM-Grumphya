import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresUserDeleteRepository } from "./postgres-user-delete.repository";

const DATABASE_URL = process.env.USER_DELETE_TEST_DATABASE_URL;
const SCHEMA_PREFIX = "user_delete_test_";

describe.skipIf(!DATABASE_URL)("Postgres physical user deletion", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let repository: PostgresUserDeleteRepository;
  let schemaName: string;
  let ownerId: string;
  let otherUserId: string;

  beforeAll(async () => {
    adminPool = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 2_000,
    });
    schemaName = `${SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
      connectionTimeoutMillis: 2_000,
    });
    await runMigrations(testPool);
    repository = new PostgresUserDeleteRepository(testPool);
    ownerId = await createUser(testPool, "owner");
    otherUserId = await createUser(testPool, "other");
    await addAccountData(testPool, ownerId, "owner");
    await addAccountData(testPool, otherUserId, "other");
  });

  afterAll(async () => {
    if (repository) await repository.close();
    else await testPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("physically removes owned ideas, quotas, sessions and billing rows while preserving other users", async () => {
    await expect(repository.deleteUser(ownerId)).resolves.toBe(true);

    const remaining = await testPool.query<{
      users: string;
      subscriptions: string;
      purchases: string;
      sessions: string;
      dailyUsage: string;
      ideas: string;
    }>(
      `SELECT
         (SELECT count(*) FROM users WHERE id=$1)::text AS users,
         (SELECT count(*) FROM subscriptions WHERE user_id=$1)::text AS subscriptions,
         (SELECT count(*) FROM simulated_purchases WHERE user_id=$1)::text AS purchases,
         (SELECT count(*) FROM auth_sessions WHERE user_id=$1)::text AS sessions,
         (SELECT count(*) FROM account_daily_plan_usage WHERE user_id=$1)::text AS "dailyUsage",
         (SELECT count(*) FROM approved_ideas WHERE user_id=$1)::text AS ideas`,
      [ownerId],
    );
    expect(remaining.rows[0]).toEqual({
      users: "0",
      subscriptions: "0",
      purchases: "0",
      sessions: "0",
      dailyUsage: "0",
      ideas: "0",
    });

    const otherUser = await testPool.query<{ users: string; ideas: string }>(
      `SELECT
         (SELECT count(*) FROM users WHERE id=$1)::text AS users,
         (SELECT count(*) FROM approved_ideas WHERE user_id=$1)::text AS ideas`,
      [otherUserId],
    );
    expect(otherUser.rows[0]).toEqual({ users: "1", ideas: "1" });
  });
});

async function createUser(pool: Pool, label: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (
       id,email,email_normalized,username,username_normalized,password_hash,
       privacy_policy_version,privacy_policy_acknowledged_at,status
     ) VALUES ($1,$2,$2,$3,$3,'test-hash','test-v1',now(),'active')`,
    [id, `${label}-${randomUUID()}@example.es`, `${label}-${randomUUID()}`],
  );
  return id;
}

async function addAccountData(
  pool: Pool,
  userId: string,
  label: string,
): Promise<void> {
  const subscription = await pool.query<{ id: string }>(
    `INSERT INTO subscriptions (
       user_id,plan_code,status,starts_at,expires_at,activation_source,idempotency_key
     ) VALUES ($1,'ILUMINADO','active',now(),now()+interval '1 month','simulated',$2)
     RETURNING id`,
    [userId, randomUUID()],
  );
  const subscriptionId = subscription.rows[0]?.id;
  if (!subscriptionId) throw new Error("Test subscription was not created.");
  await pool.query(
    `INSERT INTO simulated_purchases (
       user_id,subscription_id,idempotency_key,status,confirmed_at
     ) VALUES ($1,$2,$3,'confirmed',now())`,
    [userId, subscriptionId, randomUUID()],
  );
  await pool.query(
    `INSERT INTO auth_sessions (
       user_id,access_token_hash,refresh_token_hash,expires_at,remember_me
     ) VALUES ($1,$2,$3,now()+interval '1 day',false)`,
    [userId, `access-${label}`, `refresh-${label}`],
  );
  await pool.query(
    `INSERT INTO account_daily_plan_usage (user_id,plan_code,usage_date,ideas_used)
     VALUES ($1,'ILUMINADO',current_date,1)`,
    [userId],
  );
  await pool.query(
    "INSERT INTO approved_ideas (user_id,title) VALUES ($1,$2)",
    [userId, `Idea privada de ${label}`],
  );
}
