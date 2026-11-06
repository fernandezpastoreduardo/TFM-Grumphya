import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresRegistrationRepository } from "./postgres-registration.repository";
import { RegistrationService } from "./registration.service";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresAdminDashboardRepository } from "../admin-dashboard/postgres-admin-dashboard.repository";
import {
  hashAccessToken,
  PostgresAccessTokenSessionLookup,
} from "../infrastructure/auth/access-token-session.lookup";
import { PostgresPlanUsageRepository } from "./postgres-plan-usage.repository";

const DATABASE_URL = process.env.REGISTRATION_TEST_DATABASE_URL;
const TEST_WEB_ORIGIN = "http://127.0.0.1:5173";

describe.skipIf(!DATABASE_URL)("Postgres registration persistence", () => {
  let adminPool: Pool | undefined;
  let testPool: Pool | undefined;
  let repository: PostgresRegistrationRepository | undefined;
  let schemaName: string;

  beforeEach(() => {
    adminPool = undefined;
    testPool = undefined;
    repository = undefined;
    schemaName = "";
    vi.stubEnv("WEB_ORIGIN", TEST_WEB_ORIGIN);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const closingRepository = repository;
    const closingTestPool = testPool;
    const closingAdminPool = adminPool;
    const closingSchemaName = schemaName;
    repository = undefined;
    testPool = undefined;
    adminPool = undefined;
    schemaName = "";

    try {
      if (closingRepository) await closingRepository.close();
      else if (closingTestPool) await closingTestPool.end();
    } finally {
      if (closingAdminPool) {
        try {
          if (closingSchemaName) {
            await closingAdminPool.query(
              `DROP SCHEMA IF EXISTS "${closingSchemaName}" CASCADE`,
            );
          }
        } finally {
          await closingAdminPool.end();
        }
      }
    }
  });

  it("keeps registration pending until verification and simulated plan confirmation", async () => {
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
    let verificationToken = "";
    const service = new RegistrationService(repository, {
      send: async ({ text }) => {
        verificationToken = /#([a-f0-9]{64})/u.exec(text)?.[1] ?? "";
        return "sent";
      },
    });
    const intent = await service.createIntent("FALTON");
    const pending = await service.register(intent.token, {
      email: "Persona@example.es",
      username: "PersonaLista",
      password: "Una contraseña suficientemente segura 48!",
      privacyPolicyAcknowledged: true,
    });
    expect(pending).toMatchObject({ status: "verification_pending" });
    expect(verificationToken).toMatch(/^[a-f0-9]{64}$/u);

    const result = await adminPool.query<{
      users: string;
      active_users: string;
      unverified_users: string;
      subscriptions: string;
      purchases: string;
      plan_code: string | null;
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
      active_users: "0",
      unverified_users: "1",
      subscriptions: "0",
      purchases: "0",
      plan_code: null,
      usage_rows: "0",
      zero_usage_rows: "0",
      sessions: "0",
    });
    await expect(
      service.login({
        identifier: "persona@example.es",
        password: "Una contraseña suficientemente segura 48!",
        rememberMe: false,
      }),
    ).rejects.toMatchObject({ code: "LOGIN_UNAVAILABLE" });
    const pendingUserId = (
      await testPool.query<{ id: string }>(
        "SELECT id FROM users WHERE email_normalized=$1",
        ["persona@example.es"],
      )
    ).rows[0]?.id;
    if (!pendingUserId) throw new Error("Pending user was not found.");
    const pendingAccessHash = hashAccessToken("pending-test-access-token");
    await testPool.query(
      `INSERT INTO auth_sessions(user_id,access_token_hash,refresh_token_hash,expires_at)
       VALUES($1,$2,$3,now()+interval '1 hour')`,
      [pendingUserId, pendingAccessHash, "pending-test-refresh-hash"],
    );
    await expect(
      new PostgresAccessTokenSessionLookup(testPool).isActive(
        pendingAccessHash,
        pendingUserId,
      ),
    ).resolves.toBe(false);
    await testPool.query("DELETE FROM auth_sessions WHERE user_id=$1", [
      pendingUserId,
    ]);

    const verified = await service.verify(verificationToken);
    const confirmed = await service.confirm(verified.confirmationToken);
    expect(confirmed.result.account.user.emailVerified).toBe(true);
    expect(confirmed.result.account.user.roastMessagesSent).toBe(0);
    expect(confirmed.result.account.plans).toMatchObject([
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
    const activePlanDuration = await adminPool.query<{ days: number }>(
      `SELECT (extract(epoch FROM expires_at-starts_at)/86400)::int AS days
       FROM "${schemaName}".subscriptions LIMIT 1`,
    );
    expect(activePlanDuration.rows[0]!.days).toBeGreaterThanOrEqual(28);
    expect(activePlanDuration.rows[0]!.days).toBeLessThanOrEqual(31);

    await testPool.query(
      "UPDATE users SET email_verified_at=NULL WHERE email_normalized=$1",
      ["persona@example.es"],
    );
    const historicalSession = await service.login({
      identifier: "persona@example.es",
      password: "Una contraseña suficientemente segura 48!",
      rememberMe: false,
    });
    expect(historicalSession.result.account.user.emailVerified).toBe(false);
    expect(
      historicalSession.result.account.plans.find(
        (plan) => plan.plan === "FALTON",
      ),
    ).toMatchObject({ status: "active" });
    const historicalUserId = (
      await testPool.query<{ id: string }>(
        "SELECT id FROM users WHERE email_normalized=$1",
        ["persona@example.es"],
      )
    ).rows[0]?.id;
    if (!historicalUserId) throw new Error("Historical user was not found.");
    const accessLookup = new PostgresAccessTokenSessionLookup(testPool);
    await expect(
      accessLookup.isActive(
        hashAccessToken(historicalSession.result.accessToken),
        historicalUserId,
      ),
    ).resolves.toBe(true);
    const renewedSession = await service.refresh(
      historicalSession.refreshToken,
    );
    expect(renewedSession.result.account.user.emailVerified).toBe(false);
    await expect(
      new PostgresPlanUsageRepository(testPool).reserve(
        historicalUserId,
        "roasts",
        hashAccessToken("historical-account-idempotency"),
        hashAccessToken("historical-account-request"),
      ),
    ).resolves.toMatchObject({ state: "reserved" });

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
    ).resolves.toEqual({ status: "verification_pending" });
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

  it("reprices historical Iluminado KPIs without changing current account or subscription state", async () => {
    adminPool = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 2_000,
    });
    schemaName = `repricing_test_${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: DATABASE_URL,
      options: `-c search_path=${schemaName},public`,
      connectionTimeoutMillis: 2_000,
    });
    await runMigrations(testPool);

    const userId = randomUUID();
    await testPool.query(
      `INSERT INTO users(id,email,email_normalized,username,username_normalized,password_hash,
        privacy_policy_version,privacy_policy_acknowledged_at,status)
       VALUES($1,$2,$2,$3,$3,'test-hash','v4',now(),'active')`,
      [userId, `${userId}@example.test`, `User${userId}`],
    );
    const subscriptions = [
      { plan: "ILUMINADO", status: "active", oldPrice: 2 },
      { plan: "ILUMINADO", status: "expired", oldPrice: 2 },
      { plan: "FALTON", status: "active", oldPrice: 1 },
    ] as const;
    for (const purchase of subscriptions) {
      const subscriptionId = randomUUID();
      const idempotencyKey = randomUUID();
      await testPool.query(
        `INSERT INTO subscriptions(id,user_id,plan_code,status,starts_at,expires_at,
          activation_source,idempotency_key)
         VALUES($1,$2,$3,$4,'2025-01-01T00:00:00Z','2025-02-01T00:00:00Z','simulated',$5)`,
        [
          subscriptionId,
          userId,
          purchase.plan,
          purchase.status,
          idempotencyKey,
        ],
      );
      await testPool.query(
        `INSERT INTO simulated_purchases(user_id,subscription_id,idempotency_key,status,confirmed_at,amount_eur)
         VALUES($1,$2,$3,'confirmed','2025-01-01T00:00:00Z',$4)`,
        [userId, subscriptionId, idempotencyKey, purchase.oldPrice],
      );
    }
    await testPool.query(
      "UPDATE plans SET monthly_price_eur=2.00 WHERE code='ILUMINADO'",
    );

    await testPool.query("DELETE FROM schema_migrations WHERE version=$1", [
      "034_illuminado_price_retroactive",
    ]);
    await runMigrations(testPool);

    const persisted = await testPool.query<{
      plan_code: string;
      subscription_status: string;
      starts_at: Date;
      expires_at: Date;
      amount_eur: string;
      account_status: string;
    }>(
      `SELECT subscription.plan_code, subscription.status AS subscription_status,
         subscription.starts_at, subscription.expires_at, purchase.amount_eur::text,
         account.status AS account_status
       FROM simulated_purchases purchase
       JOIN subscriptions subscription ON subscription.id=purchase.subscription_id
       JOIN users account ON account.id=purchase.user_id
       ORDER BY subscription.plan_code, subscription.status`,
    );
    expect(persisted.rows).toMatchObject([
      {
        plan_code: "FALTON",
        subscription_status: "active",
        amount_eur: "1.00",
        account_status: "active",
      },
      {
        plan_code: "ILUMINADO",
        subscription_status: "active",
        amount_eur: "3.00",
        account_status: "active",
      },
      {
        plan_code: "ILUMINADO",
        subscription_status: "expired",
        amount_eur: "3.00",
        account_status: "active",
      },
    ]);
    for (const purchase of persisted.rows) {
      expect(purchase.starts_at.toISOString()).toBe("2025-01-01T00:00:00.000Z");
      expect(purchase.expires_at.toISOString()).toBe(
        "2025-02-01T00:00:00.000Z",
      );
    }
    const planPrice = await testPool.query<{ monthly_price_eur: string }>(
      "SELECT monthly_price_eur::text FROM plans WHERE code='ILUMINADO'",
    );
    expect(planPrice.rows[0]?.monthly_price_eur).toBe("3.00");

    const newUserId = randomUUID();
    await testPool.query(
      `INSERT INTO users(id,email,email_normalized,username,username_normalized,password_hash,
        privacy_policy_version,privacy_policy_acknowledged_at,status)
       VALUES($1,$2,$2,$3,$3,'test-hash','v4',now(),'active')`,
      [newUserId, `${newUserId}@example.test`, `User${newUserId}`],
    );
    await new PostgresRegistrationRepository(
      testPool,
    ).createSubscriptionPurchase(newUserId, "ILUMINADO", randomUUID());
    const newPurchase = await testPool.query<{ amount_eur: string }>(
      `SELECT amount_eur::text FROM simulated_purchases
       WHERE user_id=$1 AND subscription_id IN (
         SELECT id FROM subscriptions WHERE user_id=$1 AND plan_code='ILUMINADO'
       )
       ORDER BY confirmed_at DESC LIMIT 1`,
      [newUserId],
    );
    expect(newPurchase.rows[0]?.amount_eur).toBe("3.00");

    const snapshot = await new PostgresAdminDashboardRepository(
      testPool,
    ).getSnapshot();
    expect(snapshot.revenue).toEqual({ weeklyEur: 3, totalEur: 10 });
  });
});
