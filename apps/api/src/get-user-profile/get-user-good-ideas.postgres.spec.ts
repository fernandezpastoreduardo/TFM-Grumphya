import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresRegistrationRepository } from "../register-with-plan/postgres-registration.repository";

const DATABASE_URL = process.env.REGISTRATION_TEST_DATABASE_URL;
const SCHEMA_PREFIX = "get_user_good_ideas_test_";

describe.skipIf(!DATABASE_URL)("get user good ideas persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let repository: PostgresRegistrationRepository;
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
    repository = new PostgresRegistrationRepository(testPool);
    ownerId = await createUser(testPool, "owner");
    otherUserId = await createUser(testPool, "other");
    await testPool.query(
      `INSERT INTO approved_ideas(user_id,title,created_at)
       VALUES ($1,$2,now()-interval '1 day'),($1,$3,now()),($4,$5,now())`,
      [ownerId, "Idea anterior", "Idea reciente", otherUserId, "Idea ajena"],
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

  it("returns only the owner's approved titles ordered newest first", async () => {
    await expect(repository.listGoodIdeas(ownerId)).resolves.toEqual([
      expect.objectContaining({ title: "Idea reciente" }),
      expect.objectContaining({ title: "Idea anterior" }),
    ]);
  });

  it("stores a repeated authenticated submission only once", async () => {
    const submissionHash = "a".repeat(64);
    const requestHash = "b".repeat(64);
    await expect(
      repository.saveGoodIdea(
        ownerId,
        "Idea privada aprobada",
        submissionHash,
        requestHash,
      ),
    ).resolves.toBe(true);
    await expect(
      repository.saveGoodIdea(
        ownerId,
        "Idea privada aprobada",
        submissionHash,
        requestHash,
      ),
    ).resolves.toBe(true);
    await expect(
      repository.saveGoodIdea(
        ownerId,
        "Otra idea con la misma clave",
        submissionHash,
        "c".repeat(64),
      ),
    ).resolves.toBe(false);

    const result = await testPool.query<{ count: string; title: string }>(
      `SELECT count(*)::text AS count,min(title) AS title FROM approved_ideas
       WHERE user_id=$1 AND submission_hash=$2`,
      [ownerId, submissionHash],
    );

    expect(result.rows[0]).toEqual({
      count: "1",
      title: "Idea privada aprobada",
    });
  });
});

async function createUser(pool: Pool, label: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (
       email,email_normalized,username,username_normalized,password_hash,
       privacy_policy_version,privacy_policy_acknowledged_at
     ) VALUES ($1,$1,$2,$2,'test-hash','test-v1',now()) RETURNING id`,
    [`${label}-${randomUUID()}@example.es`, `${label}-${randomUUID()}`],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Test user could not be created.");
  return id;
}
