import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresBestUsersRepository } from "./postgres-best-users.repository";

const DATABASE_URL = process.env.BEST_USERS_TEST_DATABASE_URL;
const TEST_SCHEMA_PREFIX = "best_users_test_";

describe.skipIf(!DATABASE_URL)("best users ranking persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let schemaName: string;
  let repository: PostgresBestUsersRepository;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: DATABASE_URL });
    schemaName = `${TEST_SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
    });
    await runMigrations(testPool);
    repository = new PostgresBestUsersRepository(testPool);
  });

  afterAll(async () => {
    await testPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("ranks active users by approved ideas and returns at most ten", async () => {
    for (let index = 1; index <= 12; index += 1) {
      const userId = await createUser(testPool, index, "active", true);
      for (let idea = 0; idea < index; idea += 1) {
        await testPool.query(
          "INSERT INTO approved_ideas (user_id, title) VALUES ($1, $2)",
          [userId, `Idea ${index}-${idea}`],
        );
      }
    }
    const inactiveUserId = await createUser(testPool, 13, "disabled");
    await testPool.query(
      "INSERT INTO approved_ideas (user_id, title) VALUES ($1, $2)",
      [inactiveUserId, "Idea de cuenta inactiva"],
    );
    const optedOutUserId = await createUser(testPool, 14);
    await testPool.query(
      "INSERT INTO approved_ideas (user_id, title) VALUES ($1, $2)",
      [optedOutUserId, "Idea de cuenta sin adhesión al ranking"],
    );

    const users = await repository.getBestListBestUsers();

    expect(users).toHaveLength(10);
    expect(users[0]).toEqual({ username: "user-12", approvedIdeasCount: 12 });
    expect(users.at(-1)).toEqual({ username: "user-3", approvedIdeasCount: 3 });
    expect(users.some((user) => user.username === "user-13")).toBe(false);
    expect(users.some((user) => user.username === "user-14")).toBe(false);
    expect(Object.keys(users[0] ?? {}).sort()).toEqual([
      "approvedIdeasCount",
      "username",
    ]);
  });
});

async function createUser(
  pool: Pool,
  index: number,
  status = "active",
  publicRankingsOptIn = false,
): Promise<string> {
  const email = `best-user-${index}-${randomUUID()}@example.es`;
  const username = `user-${index}`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (
       email, email_normalized, username, username_normalized, password_hash,
       privacy_policy_version, privacy_policy_acknowledged_at,
       public_rankings_consent_at, public_rankings_consent_policy_version, status
     ) VALUES (
       $1, $1, $2, $2, 'test-hash', 'test-v1', now(),
       CASE WHEN $3 THEN now() END,
       CASE WHEN $3 THEN 'v2' END,
       $4
     )
     RETURNING id`,
    [email, username, publicRankingsOptIn, status],
  );
  const userId = result.rows[0]?.id;
  if (!userId) throw new Error("Test user insert returned no id.");
  return userId;
}
