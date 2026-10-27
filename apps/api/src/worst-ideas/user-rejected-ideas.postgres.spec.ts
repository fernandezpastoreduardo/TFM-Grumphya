import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresWorstIdeasRepository } from "./postgres-worst-ideas.repository";

const DATABASE_URL = process.env.WORST_IDEAS_USER_TEST_DATABASE_URL;
const TEST_SCHEMA_PREFIX = "worst_ideas_user_test_";
const EMBEDDING = Array.from({ length: 1536 }, (_, index) => index / 1536);
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const REQUEST_HASH = "c".repeat(64);

describe.skipIf(!DATABASE_URL)("user rejected ideas persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let schemaName: string;
  let ownerId: string;
  let otherUserId: string;
  let repository: PostgresWorstIdeasRepository;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: DATABASE_URL });
    schemaName = `${TEST_SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
    });
    await runMigrations(testPool);
    ownerId = await createUser(testPool, "owner");
    otherUserId = await createUser(testPool, "other");
    repository = new PostgresWorstIdeasRepository(testPool);
  });

  afterAll(async () => {
    await testPool?.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("stores authenticated matches and rejections privately with idempotent counts", async () => {
    const firstId = await repository.addToWorstIdeas(
      "La app que vende paraguas en el desierto",
      2.3,
      EMBEDDING,
      HASH_A,
      REQUEST_HASH,
      ownerId,
    );
    await repository.updateWorstIdea(
      firstId,
      HASH_B,
      REQUEST_HASH,
      "La idea vuelve con el mismo equipaje.",
      ownerId,
    );
    await repository.updateWorstIdea(
      firstId,
      HASH_B,
      REQUEST_HASH,
      "La idea vuelve con el mismo equipaje.",
      ownerId,
    );

    await expect(repository.getIdeaListWorstUser(ownerId)).resolves.toEqual([
      { safeTitle: "La app que vende paraguas en el desierto", count: 2 },
    ]);
    await expect(repository.getIdeaListWorstUser(otherUserId)).resolves.toEqual(
      [],
    );
  });

  it("physically cascades a user's rejected-idea history when the user is deleted", async () => {
    const ideaId = await repository.addToWorstIdeas(
      "Una app para coleccionar silencios",
      1.1,
      EMBEDDING,
      "d".repeat(64),
      "e".repeat(64),
      ownerId,
    );

    await testPool.query("DELETE FROM users WHERE id = $1", [ownerId]);
    const remaining = await testPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM user_rejected_ideas WHERE rejected_idea_id = $1",
      [ideaId],
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
  return result.rows[0]!.id;
}
