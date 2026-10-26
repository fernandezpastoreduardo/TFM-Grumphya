import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresRoastRankingRepository } from "./postgres-roast-ranking.repository";

const DATABASE_URL = process.env.REGISTRATION_TEST_DATABASE_URL;
const TEST_SCHEMA_PREFIX = "roast_ranking_test_";

describe.skipIf(!DATABASE_URL)("roast ranking persistence", () => {
  let adminPool: Pool;
  let testPool: Pool;
  let schemaName: string;
  let repository: PostgresRoastRankingRepository;

  beforeAll(async () => {
    adminPool = new Pool({ connectionString: DATABASE_URL });
    schemaName = `${TEST_SCHEMA_PREFIX}${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
    });
    await runMigrations(testPool);
    repository = new PostgresRoastRankingRepository(testPool);
  });

  afterAll(async () => {
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("includes Jappy after administrator roasts are counted", async () => {
    await testPool.query(
      `INSERT INTO users (
         email, email_normalized, username, username_normalized, password_hash,
         privacy_policy_version, privacy_policy_acknowledged_at,
         public_rankings_consent_at, public_rankings_consent_policy_version,
         status, role, roast_messages_sent
       ) VALUES (
         'jappy@example.invalid', 'jappy@example.invalid', 'jappy', 'jappy',
         'test-hash', 'test-v1', now(), now(), 'v2', 'active', 'admin', 12
       )`,
    );
    await testPool.query(
      `INSERT INTO users (
         email, email_normalized, username, username_normalized, password_hash,
         privacy_policy_version, privacy_policy_acknowledged_at,
         status, role, roast_messages_sent
       ) VALUES (
         'another-admin@example.invalid', 'another-admin@example.invalid',
         'another-admin', 'another-admin', 'test-hash', 'test-v1', now(),
         'active', 'admin', 99
       )`,
    );

    await expect(repository.getRoastRanking()).resolves.toEqual([
      { username: "jappy", roastMessagesSent: 12 },
    ]);
  });
});
