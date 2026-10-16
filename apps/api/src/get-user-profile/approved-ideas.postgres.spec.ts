import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";

const DATABASE_URL = process.env.APPROVED_IDEAS_TEST_DATABASE_URL;
const TEST_SCHEMA_PREFIX = "approved_ideas_test_";

describe.skipIf(!DATABASE_URL)("approved ideas schema", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let schemaName: string;
  let ownerId: string;
  let otherUserId: string;

  beforeAll(async () => {
    adminPool = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 2_000,
    });
    schemaName = `${TEST_SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
      connectionTimeoutMillis: 2_000,
    });
    await runMigrations(testPool);
    ownerId = await createUser(testPool, "owner");
    otherUserId = await createUser(testPool, "other");
  });

  afterAll(async () => {
    await testPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("keeps approved titles private to their user and orders the newest first", async () => {
    await testPool.query(
      `INSERT INTO approved_ideas (user_id, title, created_at)
       VALUES ($1, $2, now() - interval '1 day'), ($1, $3, now()), ($4, $5, now())`,
      [ownerId, "Primera idea", "Idea reciente", otherUserId, "Idea ajena"],
    );

    const result = await testPool.query<{ title: string }>(
      `SELECT title FROM approved_ideas WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [ownerId],
    );

    expect(result.rows.map(({ title }) => title)).toEqual([
      "Idea reciente",
      "Primera idea",
    ]);
  });

  it("rejects invalid titles and physically cascades approved ideas on user deletion", async () => {
    await expect(
      testPool.query(
        "INSERT INTO approved_ideas (user_id, title) VALUES ($1, $2)",
        [ownerId, " "],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await testPool.query(
      "INSERT INTO approved_ideas (user_id, title) VALUES ($1, $2)",
      [ownerId, "Una idea prometedora"],
    );

    await testPool.query("DELETE FROM users WHERE id = $1", [ownerId]);
    const remaining = await testPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM approved_ideas WHERE user_id = $1",
      [ownerId],
    );

    expect(remaining.rows[0]?.count).toBe("0");
  });
});

async function createUser(pool: Pool, label: string): Promise<string> {
  const email = `${label}-${randomUUID()}@example.es`;
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (
       email, email_normalized, username, username_normalized, password_hash,
       privacy_policy_version, privacy_policy_acknowledged_at
     ) VALUES ($1, $1, $2, $2, 'test-hash', 'test-v1', now()) RETURNING id`,
    [email, `${label}-${randomUUID()}`],
  );
  return result.rows[0].id;
}
