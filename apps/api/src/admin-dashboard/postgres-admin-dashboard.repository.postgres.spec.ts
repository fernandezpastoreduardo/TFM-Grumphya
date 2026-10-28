import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresAdminDashboardRepository } from "./postgres-admin-dashboard.repository";

const DATABASE_URL = process.env.ADMIN_DASHBOARD_TEST_DATABASE_URL;
const TEST_SCHEMA_PREFIX = "admin_dashboard_test_";

describe.skipIf(!DATABASE_URL)("admin dashboard AI cost attribution", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let schemaName: string;
  let repository: PostgresAdminDashboardRepository;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: DATABASE_URL });
    schemaName = `${TEST_SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
    });
    await runMigrations(testPool);
    repository = new PostgresAdminDashboardRepository(testPool);
  });

  afterAll(async () => {
    await testPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("includes anonymous and admin costs and preserves attribution after account deletion", async () => {
    const userId = await createUser(testPool, "registered", "user");
    const adminId = await createUser(testPool, "jappy", "admin");

    // Recreate the schema state before migration 024 so these rows exercise its
    // historical actor attribution, rather than the current write path.
    await testPool.query(`
      ALTER TABLE admin_ai_usage_events
        DROP CONSTRAINT admin_ai_usage_events_actor_type_check,
        DROP COLUMN actor_type;
      DELETE FROM schema_migrations
        WHERE version = '024_admin_ai_usage_attribution';
    `);
    await testPool.query(
      `INSERT INTO admin_ai_usage_events
         (user_id, operation, model, input_tokens, output_tokens,
          estimated_cost_usd, occurred_at)
       VALUES
         ($1, 'idea_evaluation', 'gpt-5.4-mini', 1000000, 0, 0.75,
           (date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')
             AT TIME ZONE 'Europe/Madrid') - interval '1 week' + interval '1 day'),
         ($2, 'idea_evaluation', 'gpt-5.4-mini', 1000000, 0, 0.75,
           (date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')
             AT TIME ZONE 'Europe/Madrid') - interval '1 week' + interval '1 day'),
         (NULL, 'idea_evaluation', 'gpt-5.4-mini', 1000000, 0, 0.75,
           (date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')
             AT TIME ZONE 'Europe/Madrid') - interval '1 week' + interval '1 day')`,
      [userId, adminId],
    );
    await runMigrations(testPool);

    const migrationRows = await testPool.query<{ actor_type: string }>(
      `SELECT actor_type FROM admin_ai_usage_events ORDER BY id`,
    );
    expect(migrationRows.rows.map((row) => row.actor_type)).toEqual([
      "registered_user",
      "admin",
      "anonymous",
    ]);

    await repository.recordAiUsage(usage(userId));
    await repository.recordAiUsage(usage(adminId));
    await repository.recordAiUsage(usage());
    await testPool.query("DELETE FROM users WHERE id = $1", [adminId]);

    const snapshot = await repository.getSnapshot();
    const { estimatedAiCost } = snapshot;

    expect(estimatedAiCost.totalUsd).toBeCloseTo(4.5);
    expect(estimatedAiCost.totalByActor).toEqual({
      registeredUsersUsd: 1.5,
      adminsUsd: 1.5,
      anonymousUsd: 1.5,
    });
    expect(estimatedAiCost.weeklyByActor).toEqual({
      registeredUsersUsd: 0.75,
      adminsUsd: 0.75,
      anonymousUsd: 0.75,
    });
    expect(estimatedAiCost.weeklyUsd).toBeCloseTo(2.25);
    // Admin spend remains attributed after deletion; the average uses the one active account.
    expect(estimatedAiCost.weeklyAveragePerAccountUsd).toBeCloseTo(1.5);
    expect(estimatedAiCost.totalAveragePerAccountUsd).toBeCloseTo(3);
    expect(estimatedAiCost.activeRegisteredAccountCount).toBe(1);
    expect(estimatedAiCost.activeAdminAccountCount).toBe(0);
    expect(estimatedAiCost.weeklyTrend).toHaveLength(8);
    expect(estimatedAiCost.weeklyTrend.at(-2)).toMatchObject({
      registeredUsersUsd: 0.75,
      adminsUsd: 0.75,
      anonymousUsd: 0.75,
      totalUsd: 2.25,
    });
    expect(estimatedAiCost.weeklyTrend.at(-1)).toMatchObject({
      registeredUsersUsd: 0.75,
      adminsUsd: 0.75,
      anonymousUsd: 0.75,
      totalUsd: 2.25,
    });
  });

  it("derives plan limits, distinct weekly subscribers and annual finances from persisted events", async () => {
    await testPool.query(
      "TRUNCATE admin_ai_usage_events, simulated_purchases, subscriptions, users CASCADE",
    );
    const iluminadoUser = await createUser(testPool, "iluminado", "user");
    const faltonUser = await createUser(testPool, "falton", "user");
    const adminUser = await createUser(testPool, "admin", "admin");
    const currentIluminado = await createSubscription(
      testPool,
      iluminadoUser,
      "ILUMINADO",
      "active",
      0,
      1,
    );
    await createSubscription(
      testPool,
      iluminadoUser,
      "ILUMINADO",
      "active",
      0,
      1,
    );
    await createSubscription(
      testPool,
      iluminadoUser,
      "ILUMINADO",
      "expired",
      -1,
      0,
    );
    const currentFalton = await createSubscription(
      testPool,
      faltonUser,
      "FALTON",
      "active",
      0,
      1,
    );
    await createSubscription(
      testPool,
      faltonUser,
      "ILUMINADO",
      "cancelled",
      0,
      1,
    );
    await testPool.query(
      `INSERT INTO simulated_purchases
        (user_id,subscription_id,idempotency_key,status,confirmed_at,amount_eur)
       VALUES ($1,$2,$3,'confirmed',now(),2),
              ($4,$5,$6,'confirmed',now(),1)`,
      [
        iluminadoUser,
        currentIluminado,
        randomUUID(),
        faltonUser,
        currentFalton,
        randomUUID(),
      ],
    );
    await testPool.query(
      `INSERT INTO admin_ai_usage_events
        (user_id,actor_type,operation,model,input_tokens,output_tokens,
         estimated_cost_usd,occurred_at)
       VALUES
         ($1,'registered_user','idea_evaluation','test',1,1,0.01,now()),
         ($1,'registered_user','idea_evaluation','test',1,1,0.03,now()),
         ($2,'registered_user','roast','test',1,1,0.02,now()),
         ($1,'registered_user','idea_embedding','test',1,0,0.50,now()),
         ($1,'registered_user','idea_evaluation','unknown',1,1,NULL,now()),
         ($3,'admin','idea_evaluation','test',1,1,1.00,now()),
         (NULL,'anonymous','idea_evaluation','test',1,1,1.00,now())`,
      [iluminadoUser, faltonUser, adminUser],
    );

    const snapshot = await repository.getSnapshot();

    expect(snapshot.maximumMonthlyCost).toEqual({
      iluminado: {
        averagePerAttemptUsd: 0.02,
        monthlyMaximumUsd: 6.6,
        pricedAttempts: 2,
      },
      falton: {
        averagePerAttemptUsd: 0.02,
        monthlyMaximumUsd: 6.6,
        pricedAttempts: 1,
      },
      dailyAttempts: 11,
      assumedDaysPerMonth: 30,
    });
    expect(snapshot.weeklyActivePlans.at(-1)).toMatchObject({
      iluminado: 1,
      falton: 1,
    });
    expect(snapshot.weeklyActivePlans.at(-2)).toMatchObject({
      iluminado: 1,
      falton: 0,
    });
    const currentMonth = snapshot.annualFinance.months.at(-1);
    expect(currentMonth).toMatchObject({
      revenueEur: 3,
      hostingEur: 12,
    });
    expect(currentMonth?.aiCostUsd).toBeCloseTo(2.56);
    expect(currentMonth?.aiCostEur).toBeCloseTo(2.56 / 1.115);
    expect(currentMonth?.netEur).toBeCloseTo(3 - 12 - 2.56 / 1.115);
  });
});

function usage(userId?: string) {
  return {
    userId,
    operation: "idea_evaluation" as const,
    model: "gpt-5.4-mini",
    inputTokens: 1_000_000,
    outputTokens: 0,
  };
}

async function createUser(pool: Pool, username: string, role: string) {
  const email = `${username}-${randomUUID()}@example.es`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (
       email, email_normalized, username, username_normalized, password_hash,
       privacy_policy_version, privacy_policy_acknowledged_at, role, status
     ) VALUES ($1, $1, $2, $2, 'test-hash', 'test-v1', now(), $3, 'active')
     RETURNING id`,
    [email, username, role],
  );
  const userId = result.rows[0]?.id;
  if (!userId) throw new Error("Test user insert returned no id.");
  return userId;
}

async function createSubscription(
  pool: Pool,
  userId: string,
  plan: "ILUMINADO" | "FALTON",
  status: "active" | "expired" | "cancelled",
  startWeekOffset: number,
  endWeekOffset: number,
) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO subscriptions
      (user_id,plan_code,status,starts_at,expires_at,activation_source,idempotency_key)
     VALUES ($1,$2,$3,
       (date_trunc('week',now() AT TIME ZONE 'Europe/Madrid')
         + $4::int * interval '1 week') AT TIME ZONE 'Europe/Madrid',
       (date_trunc('week',now() AT TIME ZONE 'Europe/Madrid')
         + $5::int * interval '1 week') AT TIME ZONE 'Europe/Madrid',
       'simulated',$6)
     RETURNING id`,
    [userId, plan, status, startWeekOffset, endWeekOffset, randomUUID()],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Test subscription insert returned no id.");
  return id;
}
