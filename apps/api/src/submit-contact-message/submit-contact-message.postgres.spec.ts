import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresContactMessageRepository } from "./postgres-contact-message.repository";

const DATABASE_URL = process.env.CONTACT_MESSAGE_TEST_DATABASE_URL;
const SCHEMA_PREFIX = "contact_message_test_";

describe.skipIf(!DATABASE_URL)("contact message persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let repository: PostgresContactMessageRepository;
  let schemaName: string;
  let userId: string;

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
    repository = new PostgresContactMessageRepository(
      testPool,
      async () => undefined,
    );
    userId = await createUser(testPool);
  });

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("persists a message for its account and physically removes it with that account", async () => {
    await repository.createForUser(
      userId,
      "Consulta de cuenta",
      "Necesito ayuda con el estado de mi plan.",
    );

    const stored = await testPool.query<{
      user_id: string;
      subject: string;
      message: string;
    }>(
      `SELECT user_id, subject, message FROM contact_messages WHERE user_id = $1`,
      [userId],
    );
    expect(stored.rows).toEqual([
      {
        user_id: userId,
        subject: "Consulta de cuenta",
        message: "Necesito ayuda con el estado de mi plan.",
      },
    ]);

    await testPool.query("DELETE FROM users WHERE id = $1", [userId]);
    const remaining = await testPool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM contact_messages WHERE user_id = $1",
      [userId],
    );
    expect(remaining.rows[0]?.count).toBe("0");
  });
});

async function createUser(pool: Pool): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (
       email, email_normalized, username, username_normalized, password_hash,
       privacy_policy_version, privacy_policy_acknowledged_at
     ) VALUES ($1, $1, $2, $2, 'test-hash', 'test-v1', now()) RETURNING id`,
    [`contact-${randomUUID()}@example.es`, `contact-${randomUUID()}`],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Test user could not be created.");
  return id;
}
