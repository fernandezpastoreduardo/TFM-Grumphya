import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { PostgresRegistrationRepository } from "./postgres-registration.repository";
import { RegistrationService } from "./registration.service";

const DATABASE_URL = process.env.REGISTRATION_TEST_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("Postgres registration persistence", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let repository: PostgresRegistrationRepository | undefined;
  let schemaName: string;

  afterEach(async () => {
    if (repository) await repository.close();
    else if (testPool) await testPool.end();
    if (adminPool && schemaName) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  });

  it("atomically persists an active unverified account, one-month plan, simulated purchase, quotas and session", async () => {
    adminPool = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 2_000,
    });
    schemaName = `registration_test_${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
      connectionTimeoutMillis: 2_000,
    });
    repository = new PostgresRegistrationRepository(testPool);
    const service = new RegistrationService(repository);
    const intent = await service.createIntent("FALTON");
    const session = await service.register(intent.token, {
      email: "Persona@example.es",
      username: "PersonaLista",
      password: "Una contraseña suficientemente segura 48!",
      privacyPolicyAcknowledged: true,
    });
    expect(session.result.account.user.emailVerified).toBe(false);
    expect(session.result.account.user.roastMessagesSent).toBe(0);
    expect(session.result.account.plans).toMatchObject([
      {
        plan: "FALTON",
        status: "active",
        attemptsRemaining: { ideas: 0, roasts: 11 },
      },
      {
        plan: "ILUMINADO",
        status: "inactive",
        attemptsRemaining: { ideas: 0, roasts: 0 },
      },
    ]);

    const result = await adminPool.query<{
      users: string;
      active_users: string;
      unverified_users: string;
      subscriptions: string;
      purchases: string;
      plan_code: string;
      days: number;
      usage_rows: string;
      zero_usage_rows: string;
      sessions: string;
    }>(
      `SELECT
         (SELECT count(*) FROM "${schemaName}".users)::text AS users,
         (SELECT count(*) FROM "${schemaName}".users WHERE status='active')::text AS active_users,
         (SELECT count(*) FROM "${schemaName}".users WHERE email_verified_at IS NULL)::text AS unverified_users,
         (SELECT count(*) FROM "${schemaName}".subscriptions)::text AS subscriptions,
         (SELECT count(*) FROM "${schemaName}".simulated_purchases)::text AS purchases,
         (SELECT plan_code FROM "${schemaName}".subscriptions LIMIT 1) AS plan_code,
         (SELECT extract(epoch FROM expires_at-starts_at)/86400 FROM "${schemaName}".subscriptions LIMIT 1)::int AS days,
         (SELECT count(*) FROM "${schemaName}".account_daily_plan_usage)::text AS usage_rows,
         (SELECT count(*) FROM "${schemaName}".account_daily_plan_usage WHERE ideas_used=0 AND roasts_used=0)::text AS zero_usage_rows,
         (SELECT count(*) FROM "${schemaName}".auth_sessions)::text AS sessions`,
    );
    expect(result.rows[0]).toMatchObject({
      users: "1",
      active_users: "1",
      unverified_users: "1",
      subscriptions: "1",
      purchases: "1",
      plan_code: "FALTON",
      usage_rows: "2",
      zero_usage_rows: "2",
      sessions: "1",
    });
    expect(result.rows[0]!.days).toBeGreaterThanOrEqual(28);
    expect(result.rows[0]!.days).toBeLessThanOrEqual(31);

    await adminPool.query(
      `INSERT INTO "${schemaName}".registration_intents(token_hash,plan_code,expires_at)
       VALUES('expired-intent-hash','ILUMINADO',now()-interval '1 minute')`,
    );
    await service.createIntent("ILUMINADO");
    const expiredIntents = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${schemaName}".registration_intents
       WHERE expires_at <= now()`,
    );
    expect(expiredIntents.rows[0]?.count).toBe("0");

    await adminPool.query(
      `INSERT INTO "${schemaName}".auth_sessions
         (user_id,access_token_hash,refresh_token_hash,expires_at,revoked_at)
       SELECT id,'expired-access-hash','expired-refresh-hash',now()-interval '1 minute',NULL
       FROM "${schemaName}".users WHERE email_normalized='persona@example.es'`,
    );
    await adminPool.query(
      `INSERT INTO "${schemaName}".auth_sessions
         (user_id,access_token_hash,refresh_token_hash,expires_at,revoked_at)
       SELECT id,'revoked-access-hash','revoked-refresh-hash',now()+interval '1 day',now()
       FROM "${schemaName}".users WHERE email_normalized='persona@example.es'`,
    );
    await service.login({
      identifier: "persona@example.es",
      password: "Una contraseña suficientemente segura 48!",
      rememberMe: false,
    });
    const staleSessions = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${schemaName}".auth_sessions
       WHERE revoked_at IS NOT NULL OR expires_at <= now()`,
    );
    expect(staleSessions.rows[0]?.count).toBe("0");

    const duplicateIntent = await service.createIntent("ILUMINADO");
    const sessionsBeforeConflict = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${schemaName}".auth_sessions`,
    );
    await expect(
      service.register(duplicateIntent.token, {
        email: "persona@example.es",
        username: "OtraPersona",
        password: "Otra contraseña suficientemente segura 48!",
        privacyPolicyAcknowledged: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "REGISTRATION_UNAVAILABLE",
    });
    const afterConflict = await adminPool.query<{
      users: string;
      subscriptions: string;
      sessions: string;
    }>(
      `SELECT
         (SELECT count(*) FROM "${schemaName}".users)::text AS users,
         (SELECT count(*) FROM "${schemaName}".subscriptions)::text AS subscriptions,
         (SELECT count(*) FROM "${schemaName}".auth_sessions)::text AS sessions`,
    );
    expect(afterConflict.rows[0]).toEqual({
      users: "1",
      subscriptions: "1",
      sessions: sessionsBeforeConflict.rows[0]?.count,
    });
  });
});
