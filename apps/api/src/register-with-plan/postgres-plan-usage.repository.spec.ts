import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresPlanUsageRepository } from "./postgres-plan-usage.repository";

const DATABASE_URL = process.env.REGISTRATION_TEST_DATABASE_URL;
const SCHEMA_PREFIX = "plan_usage_test_";
const OWNER_ID = "123e4567-e89b-42d3-a456-426614174000";
const HASHES = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(64, "0"),
);
const REQUEST_HASH = "f".repeat(64);

describe.skipIf(!DATABASE_URL)("authenticated plan usage persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let repository: PostgresPlanUsageRepository;
  let schemaName: string;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: DATABASE_URL });
    schemaName = `${SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
    });
    await runMigrations(testPool);
    repository = new PostgresPlanUsageRepository(testPool);
    await createAccount(testPool, OWNER_ID, "ILUMINADO");
    await createAccount(
      testPool,
      "123e4567-e89b-42d3-a456-426614174001",
      "FALTON",
    );
  });

  afterAll(async () => {
    if (repository) await repository.close();
    else await testPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("enforces the 11-per-day limit atomically, caches retries, and uses Madrid date", async () => {
    const reservations = await Promise.allSettled(
      HASHES.map((hash) => repository.reserve(OWNER_ID, "ideas", hash, REQUEST_HASH)),
    );
    const reservedHashes = reservations.flatMap((result, index) =>
      result.status === "fulfilled" && result.value.state === "reserved"
        ? [HASHES[index]!]
        : [],
    );
    const exhausted = reservations.filter(
      (result) => result.status === "rejected",
    );
    expect(reservedHashes).toHaveLength(11);
    expect(exhausted).toHaveLength(1);

    await Promise.all(
      reservedHashes.map((hash) =>
        repository.commit(OWNER_ID, "ideas", hash, REQUEST_HASH, {
          response: hash.slice(0, 4),
        }),
      ),
    );
    const retry = await repository.reserve(
      OWNER_ID,
      "ideas",
      reservedHashes[0]!,
      REQUEST_HASH,
    );
    expect(retry).toEqual({
      state: "cached",
      response: { response: reservedHashes[0]!.slice(0, 4) },
    });

    const result = await testPool.query<{ used: number; usage_date: string }>(
      `SELECT ideas_used AS used,usage_date::text FROM account_daily_plan_usage
       WHERE user_id=$1 AND plan_code='ILUMINADO'`,
      [OWNER_ID],
    );
    const date = await testPool.query<{ today: string }>(
      "SELECT (now() AT TIME ZONE 'Europe/Madrid')::date::text AS today",
    );
    expect(result.rows[0]).toEqual({ used: 11, usage_date: date.rows[0]!.today });
  });

  it("requires the matching active plan and returns a released attempt to the quota", async () => {
    const faltonUser = "123e4567-e89b-42d3-a456-426614174001";
    await expect(
      repository.reserve(OWNER_ID, "roasts", HASHES[0]!, REQUEST_HASH),
    ).rejects.toThrow("ACTIVE_PLAN_REQUIRED");

    await expect(
      repository.reserve(faltonUser, "roasts", HASHES[0]!, REQUEST_HASH),
    ).resolves.toEqual({ state: "reserved" });
    await repository.release(faltonUser, "roasts", HASHES[0]!);
    await expect(
      repository.reserve(faltonUser, "roasts", HASHES[0]!, REQUEST_HASH),
    ).resolves.toEqual({ state: "reserved" });
    await repository.commit(
      faltonUser,
      "roasts",
      HASHES[0]!,
      REQUEST_HASH,
      { reply: "ok" },
    );

    const result = await testPool.query<{ roasts_used: number }>(
      `SELECT roasts_used FROM account_daily_plan_usage
       WHERE user_id=$1 AND plan_code='FALTON'`,
      [faltonUser],
    );
    expect(result.rows[0]?.roasts_used).toBe(1);
  });
});

async function createAccount(pool: Pool, userId: string, planCode: string) {
  await pool.query(
    `INSERT INTO users(id,email,email_normalized,username,username_normalized,password_hash,
       privacy_policy_version,privacy_policy_acknowledged_at,email_verified_at,status)
     VALUES($1,$2,$2,$3,$3,'test-hash','test-v1',now(),now(),'active')`,
    [userId, `${userId}@example.es`, userId.slice(-4)],
  );
  await pool.query(
    `INSERT INTO subscriptions(user_id,plan_code,status,starts_at,expires_at,activation_source,idempotency_key)
     VALUES($1,$2,'active',now()-interval '1 day',now()+interval '1 month','simulated',$3)`,
    [userId, planCode, randomUUID()],
  );
}
