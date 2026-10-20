import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresPasswordResetRepository } from "./postgres-password-reset.repository";

const DATABASE_URL = process.env.REGISTRATION_TEST_DATABASE_URL;
const SCHEMA_PREFIX = "password_reset_test_";
const TEST_PASSWORD_HASH = "bcrypt-sha256$test-hash";

describe.skipIf(!DATABASE_URL)("password reset PostgreSQL persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let repository: PostgresPasswordResetRepository;
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
    repository = new PostgresPasswordResetRepository(testPool);
    userId = await createActiveUser(testPool);
  });

  afterAll(async () => {
    if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("persists a single-use token, updates the password, and revokes sessions", async () => {
    await testPool.query(
      `INSERT INTO auth_sessions
         (user_id, access_token_hash, refresh_token_hash, expires_at)
       VALUES ($1, 'access-hash', 'refresh-hash', now() + interval '1 day')`,
      [userId],
    );

    const target = await repository.replaceToken(
      "persona@example.es",
      "reset-token-hash",
      new Date(Date.now() + 20 * 60 * 1000),
    );

    expect(target).toEqual({ userId, email: "persona@example.es" });
    await expect(
      repository.consumeToken("reset-token-hash", TEST_PASSWORD_HASH),
    ).resolves.toBe(true);
    await expect(
      repository.consumeToken("reset-token-hash", "second-password-hash"),
    ).resolves.toBe(false);

    const persisted = await testPool.query<{
      password_hash: string;
      token_hash: string | null;
      revoked_at: Date | null;
    }>(
      `SELECT users.password_hash, password_reset_tokens.token_hash,
              auth_sessions.revoked_at
       FROM users
       JOIN password_reset_tokens ON password_reset_tokens.user_id=users.id
       JOIN auth_sessions ON auth_sessions.user_id=users.id
       WHERE users.id=$1`,
      [userId],
    );
    expect(persisted.rows).toEqual([
      {
        password_hash: TEST_PASSWORD_HASH,
        token_hash: null,
        revoked_at: expect.any(Date),
      },
    ]);
  });
});

async function createActiveUser(pool: Pool): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (
       email, email_normalized, username, username_normalized, password_hash,
       privacy_policy_version, privacy_policy_acknowledged_at, role, status,
       email_verified_at
     ) VALUES (
       'persona@example.es', 'persona@example.es', 'persona', 'persona',
       'old-password-hash', 'test-v1', now(), 'user', 'active', now()
     ) RETURNING id`,
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Test user insert returned no id.");
  return id;
}
