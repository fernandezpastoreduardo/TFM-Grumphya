import { randomUUID } from "node:crypto";
import { type Pool, type PoolClient } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import type {
  AccountProfile,
  AccountPlanStatus,
  DirectRegistration,
  ConfirmedRegistration,
  PlanCode,
  LoginIdentity,
  PendingRegistration,
  RegistrationInput,
  SessionIdentity,
  UserGoodIdea,
  VerifiedResult,
} from "./registration.models";
import type { RegistrationRepository } from "./registration.repository";
import { runMigrations } from "../infrastructure/database/run-migrations";

const GOOD_IDEAS_LIMIT = 10;
const PRIVACY_POLICY_VERSION = "v5";
const PUBLIC_RANKINGS_CONSENT_POLICY_VERSION = "v2";
const REGISTRATION_INTENT_CLEANUP_BATCH = 500;
const AUTH_SESSION_CLEANUP_BATCH = 500;

function parseRoastMessagesSent(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export class PostgresRegistrationRepository implements RegistrationRepository {
  private readonly pool: Pool;
  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }
  private ready?: Promise<void>;

  async createIntent(
    plan: PlanCode,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.ensureSchema();
    await this.cleanupExpiredRegistrationIntents(this.pool);
    await this.pool.query(
      "INSERT INTO registration_intents(token_hash, plan_code, expires_at) VALUES($1,$2,$3)",
      [tokenHash, plan, expiresAt],
    );
  }

  async currentIntent(tokenHash: string): Promise<PlanCode | null> {
    await this.ensureSchema();
    const result = await this.pool.query<{ plan_code: PlanCode }>(
      "SELECT plan_code FROM registration_intents WHERE token_hash=$1 AND expires_at > now()",
      [tokenHash],
    );
    return result.rows[0]?.plan_code ?? null;
  }

  async consumeIntentAndRegister(
    tokenHash: string,
    input: RegistrationInput,
    passwordHash: string,
    verificationHash: string,
    verificationExpiresAt: Date,
  ): Promise<PendingRegistration> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      await client.query(
        `DELETE FROM users AS expired_user
         USING pending_registrations AS expired_registration
         WHERE expired_registration.user_id=expired_user.id
           AND expired_user.status='pending_email_verification'
           AND expired_registration.verification_expires_at <= now()
           AND expired_registration.verified_token_hash IS NULL`,
      );
      const intent = await client.query<{ plan_code: PlanCode }>(
        "DELETE FROM registration_intents WHERE token_hash=$1 AND expires_at > now() RETURNING plan_code",
        [tokenHash],
      );
      const plan = intent.rows[0]?.plan_code;
      if (!plan) throw new Error("Registration intent unavailable.");
      const email = input.email.trim().toLowerCase();
      const username = input.username.trim().toLowerCase();
      const user = await client.query<{ id: string }>(
        `INSERT INTO users(email,email_normalized,username,username_normalized,password_hash,privacy_policy_version,privacy_policy_acknowledged_at,status)
         VALUES($1,$2,$3,$4,$5,$6,now(),'pending_email_verification') RETURNING id`,
        [
          input.email.trim(),
          email,
          input.username.trim(),
          username,
          passwordHash,
          PRIVACY_POLICY_VERSION,
        ],
      );
      const userId = user.rows[0]!.id;
      const pending = await client.query<{ id: string }>(
        `INSERT INTO pending_registrations(user_id,plan_code,verification_token_hash,verification_expires_at)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [userId, plan, verificationHash, verificationExpiresAt],
      );
      return { id: pending.rows[0]!.id, email: input.email.trim() };
    });
  }

  async replaceVerificationToken(
    email: string,
    verificationHash: string,
    verificationExpiresAt: Date,
  ): Promise<PendingRegistration | null> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const result = await client.query<{ id: string; email: string }>(
        `UPDATE pending_registrations AS pending
         SET verification_token_hash=$2, verification_expires_at=$3,
             verification_resend_count=verification_resend_count+1,
             verification_last_sent_at=now()
         FROM users AS user_account
         WHERE pending.user_id=user_account.id
           AND user_account.email_normalized=$1
           AND user_account.status='pending_email_verification'
           AND pending.verified_token_hash IS NULL
           AND pending.verification_resend_count < 5
           AND pending.verification_last_sent_at < now() - interval '60 seconds'
         RETURNING pending.id,user_account.email`,
        [email, verificationHash, verificationExpiresAt],
      );
      const pending = result.rows[0];
      return pending ? { id: pending.id, email: pending.email } : null;
    });
  }

  async releaseVerificationResendCooldown(
    registrationId: string,
  ): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `UPDATE pending_registrations
       SET verification_last_sent_at=now() - interval '60 seconds'
       WHERE id=$1 AND verified_token_hash IS NULL`,
      [registrationId],
    );
  }

  async activateWithRegistration(
    userId: string,
    tokenHash: string,
    input: RegistrationInput,
    passwordHash: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    sessionExpiresAt: Date,
  ): Promise<DirectRegistration> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const intent = await client.query<{ plan_code: PlanCode }>(
        `DELETE FROM registration_intents WHERE token_hash=$1 AND expires_at > now()
         RETURNING plan_code`,
        [tokenHash],
      );
      const plan = intent.rows[0]?.plan_code;
      if (!plan) throw new Error("Registration intent unavailable.");

      const user = await client.query<{ id: string }>(
        `INSERT INTO users(id,email,email_normalized,username,username_normalized,password_hash,
          privacy_policy_version,privacy_policy_acknowledged_at,email_verified_at,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,now(),NULL,'active') RETURNING id`,
        [
          userId,
          input.email,
          input.email,
          input.username,
          input.username.toLowerCase(),
          passwordHash,
          PRIVACY_POLICY_VERSION,
        ],
      );
      const createdUserId = user.rows[0]?.id;
      if (!createdUserId || createdUserId !== userId)
        throw new Error("User could not be created.");

      const activationKey = randomUUID();
      const subscription = await client.query<{ id: string }>(
        `INSERT INTO subscriptions(user_id,plan_code,status,starts_at,expires_at,activation_source,idempotency_key)
         SELECT $1,p.code,'active',now(),now()+make_interval(months => p.validity_months),'simulated',$2
         FROM plans p WHERE p.code=$3 RETURNING id`,
        [userId, activationKey, plan],
      );
      const subscriptionId = subscription.rows[0]?.id;
      if (!subscriptionId) throw new Error("Selected plan unavailable.");
      await client.query(
        `INSERT INTO simulated_purchases(user_id,subscription_id,idempotency_key,status,confirmed_at,amount_eur)
         SELECT $1,$2,$3,'confirmed',now(),monthly_price_eur FROM plans WHERE code=$4`,
        [userId, subscriptionId, activationKey, plan],
      );
      await client.query(
        `INSERT INTO account_daily_plan_usage(user_id,plan_code,usage_date,ideas_used,roasts_used)
         SELECT $1,p.code,(now() AT TIME ZONE 'Europe/Madrid')::date,0,0 FROM plans p
         ON CONFLICT (user_id,plan_code,usage_date) DO NOTHING`,
        [userId],
      );
      await this.cleanupStaleAuthSessions(client);
      await client.query(
        `INSERT INTO auth_sessions(user_id,access_token_hash,refresh_token_hash,expires_at,remember_me)
         VALUES($1,$2,$3,$4,false)`,
        [userId, accessTokenHash, refreshTokenHash, sessionExpiresAt],
      );
      const account = await this.readProfile(client, refreshTokenHash);
      if (!account) throw new Error("New account could not be loaded.");
      return { userId, plan, account };
    });
  }

  async findLoginIdentity(identifier: string): Promise<LoginIdentity | null> {
    await this.ensureSchema();
    const normalized = identifier.trim().toLowerCase();
    const result = await this.pool.query<LoginIdentity>(
      `SELECT id AS "userId",username,password_hash AS "passwordHash"
       FROM users
       WHERE (email_normalized=$1 OR username_normalized=$1) AND status='active'
         AND email_verified_at IS NOT NULL
       LIMIT 1`,
      [normalized],
    );
    return result.rows[0] ?? null;
  }

  async updatePasswordHash(
    userId: string,
    expectedHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `UPDATE users SET password_hash=$3
       WHERE id=$1 AND password_hash=$2`,
      [userId, expectedHash, passwordHash],
    );
    return result.rowCount === 1;
  }

  async createSession(
    userId: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    expiresAt: Date,
    rememberMe: boolean,
  ): Promise<void> {
    await this.ensureSchema();
    await this.cleanupStaleAuthSessions(this.pool);
    await this.pool.query(
      `INSERT INTO auth_sessions(user_id,access_token_hash,refresh_token_hash,expires_at,remember_me)
       VALUES($1,$2,$3,$4,$5)`,
      [userId, accessTokenHash, refreshTokenHash, expiresAt, rememberMe],
    );
  }

  async revokeSession(refreshTokenHash: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `UPDATE auth_sessions SET revoked_at=now()
       WHERE (refresh_token_hash=$1 OR previous_refresh_token_hash=$1)
         AND revoked_at IS NULL`,
      [refreshTokenHash],
    );
  }

  async getSessionIdentity(
    refreshTokenHash: string,
  ): Promise<SessionIdentity | null> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      user_id: string;
      username: string;
      plan_code: PlanCode;
      remember_me: boolean;
      expires_at: Date;
    }>(
      `SELECT session.user_id,user_account.username,
         COALESCE(active_plan.plan_code,'ILUMINADO') AS plan_code,
         session.remember_me,session.expires_at
       FROM auth_sessions session
       JOIN users user_account ON user_account.id=session.user_id
       LEFT JOIN LATERAL (
         SELECT plan_code FROM subscriptions
         WHERE user_id=session.user_id AND status='active'
           AND starts_at <= now() AND expires_at > now()
         ORDER BY starts_at DESC LIMIT 1
       ) active_plan ON true
       WHERE session.refresh_token_hash=$1 AND session.revoked_at IS NULL
         AND session.expires_at > now() AND user_account.status='active'
         AND user_account.email_verified_at IS NOT NULL`,
      [refreshTokenHash],
    );
    const session = result.rows[0];
    return session
      ? {
          userId: session.user_id,
          username: session.username,
          plan: session.plan_code,
          rememberMe: session.remember_me,
          expiresAt: session.expires_at,
        }
      : null;
  }

  async verify(
    verificationHash: string,
    verifiedTokenHash: string,
    verifiedTokenExpiresAt: Date,
  ): Promise<VerifiedResult> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const result = await client.query<{
        plan_code: PlanCode;
        user_id: string;
      }>(
        `UPDATE pending_registrations SET verification_token_hash='consumed:' || id::text, verified_token_hash=$2, verified_token_expires_at=$3
         WHERE verification_token_hash=$1 AND verification_expires_at > now() AND verified_token_hash IS NULL
         RETURNING plan_code,user_id`,
        [verificationHash, verifiedTokenHash, verifiedTokenExpiresAt],
      );
      if (!result.rows[0]) throw new Error("Verification unavailable.");
      await client.query(
        "UPDATE users SET email_verified_at=now(),status='email_verified' WHERE id=$1",
        [result.rows[0].user_id],
      );
      return { status: "email_verified", plan: result.rows[0].plan_code };
    });
  }

  async getVerifiedRegistrationUserId(
    verifiedTokenHash: string,
  ): Promise<string | null> {
    await this.ensureSchema();
    const result = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM pending_registrations
       WHERE verified_token_hash=$1 AND verified_token_expires_at > now()
         AND confirmed_at IS NULL`,
      [verifiedTokenHash],
    );
    return result.rows[0]?.user_id ?? null;
  }

  async confirm(
    verifiedTokenHash: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<ConfirmedRegistration> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        user_id: string;
        username: string;
        plan_code: PlanCode;
        confirmed_at: Date | null;
      }>(
        `SELECT p.id,p.user_id,u.username,p.plan_code,p.confirmed_at FROM pending_registrations p
         JOIN users u ON u.id=p.user_id WHERE p.verified_token_hash=$1 AND p.verified_token_expires_at > now() AND p.confirmed_at IS NULL FOR UPDATE OF p`,
        [verifiedTokenHash],
      );
      const registration = found.rows[0];
      if (!registration) throw new Error("Verification required.");
      {
        const subscription = await client.query<{ id: string }>(
          `INSERT INTO subscriptions(user_id,plan_code,status,starts_at,expires_at,activation_source,idempotency_key)
           SELECT $1,p.code,'active',now(),now()+make_interval(months => p.validity_months),'simulated',$3
           FROM plans p WHERE p.code=$2 RETURNING id`,
          [registration.user_id, registration.plan_code, registration.id],
        );
        if (!subscription.rows[0])
          throw new Error("Selected plan unavailable.");
        await client.query(
          `INSERT INTO account_daily_plan_usage(user_id,plan_code,usage_date,ideas_used,roasts_used)
           SELECT $1,p.code,(now() AT TIME ZONE 'Europe/Madrid')::date,0,0 FROM plans p
           ON CONFLICT (user_id,plan_code,usage_date) DO NOTHING`,
          [registration.user_id],
        );
        await this.cleanupStaleAuthSessions(client);
        await client.query(
          `INSERT INTO simulated_purchases(user_id,subscription_id,idempotency_key,status,confirmed_at,amount_eur)
           SELECT $1,$2,$3,'confirmed',now(),monthly_price_eur FROM plans WHERE code=$4`,
          [
            registration.user_id,
            subscription.rows[0]!.id,
            registration.id,
            registration.plan_code,
          ],
        );
        await client.query("UPDATE users SET status='active' WHERE id=$1", [
          registration.user_id,
        ]);
        await client.query(
          "UPDATE pending_registrations SET confirmed_at=now() WHERE id=$1",
          [registration.id],
        );
        await client.query(
          "INSERT INTO auth_sessions(user_id,access_token_hash,refresh_token_hash,expires_at) VALUES($1,$2,$3,$4)",
          [registration.user_id, accessTokenHash, refreshTokenHash, expiresAt],
        );
      }
      return {
        status: "active",
        plan: registration.plan_code,
        userId: registration.user_id,
        username: registration.username,
      };
    });
  }

  async rotateSession(
    refreshTokenHash: string,
    accessTokenHash: string,
    nextRefreshTokenHash: string,
  ): Promise<SessionIdentity> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        user_id: string;
        username: string;
        plan_code: PlanCode;
        remember_me: boolean;
        expires_at: Date;
      }>(
        `SELECT s.id,s.user_id,u.username,COALESCE(active_plan.plan_code,'ILUMINADO') AS plan_code,
           s.remember_me,s.expires_at FROM auth_sessions s
         JOIN users u ON u.id=s.user_id
         LEFT JOIN LATERAL (
           SELECT plan_code FROM subscriptions
           WHERE user_id=s.user_id AND status='active' AND starts_at <= now() AND expires_at > now()
           ORDER BY starts_at DESC LIMIT 1
         ) active_plan ON true
         WHERE s.refresh_token_hash=$1 AND s.revoked_at IS NULL
           AND s.expires_at > now() AND u.status='active'
           AND u.email_verified_at IS NOT NULL
         FOR UPDATE OF s`,
        [refreshTokenHash],
      );
      const identity = found.rows[0];
      if (!identity) throw new Error("Refresh token unavailable.");
      const rotated = await client.query(
        `UPDATE auth_sessions SET access_token_hash=$2,
           previous_refresh_token_hash=refresh_token_hash,refresh_token_hash=$3
         WHERE id=$1 AND refresh_token_hash=$4 AND revoked_at IS NULL AND expires_at > now()`,
        [identity.id, accessTokenHash, nextRefreshTokenHash, refreshTokenHash],
      );
      if (rotated.rowCount !== 1) throw new Error("Refresh token unavailable.");
      return {
        userId: identity.user_id,
        username: identity.username,
        plan: identity.plan_code,
        rememberMe: identity.remember_me,
        expiresAt: identity.expires_at,
      };
    });
  }

  async getProfile(refreshTokenHash: string): Promise<AccountProfile | null> {
    await this.ensureSchema();
    return this.readProfile(this.pool, refreshTokenHash);
  }

  async getProfileForUser(userId: string): Promise<AccountProfile | null> {
    await this.ensureSchema();
    return this.readProfileForUser(this.pool, userId);
  }

  async setPublicRankingsOptIn(
    userId: string,
    enabled: boolean,
  ): Promise<AccountProfile | null> {
    await this.ensureSchema();
    await this.pool.query(
      `UPDATE users SET
         public_rankings_consent_at = CASE WHEN $2 THEN now() ELSE NULL END,
         public_rankings_consent_policy_version = CASE WHEN $2 THEN $3 ELSE NULL END
       WHERE id=$1 AND status='active'`,
      [userId, enabled, PUBLIC_RANKINGS_CONSENT_POLICY_VERSION],
    );
    return this.readProfileForUser(this.pool, userId);
  }

  async listGoodIdeas(userId: string): Promise<UserGoodIdea[]> {
    await this.ensureSchema();
    const result = await this.pool.query<{
      id: string;
      title: string;
      created_at: Date;
    }>(
      `SELECT id,title,created_at FROM approved_ideas
       WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,
      [userId, GOOD_IDEAS_LIMIT],
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async saveGoodIdea(
    userId: string,
    title: string,
    submissionHash: string,
    requestHash: string,
  ): Promise<boolean> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const inserted = await client.query<{ request_hash: string }>(
        `INSERT INTO approved_ideas(user_id,title,submission_hash,request_hash)
         VALUES($1,$2,$3,$4)
         ON CONFLICT (user_id,submission_hash) DO NOTHING
         RETURNING request_hash`,
        [userId, title, submissionHash, requestHash],
      );
      if (inserted.rows[0]) return true;
      const existing = await client.query<{ request_hash: string }>(
        `SELECT request_hash FROM approved_ideas
         WHERE user_id=$1 AND submission_hash=$2 FOR UPDATE`,
        [userId, submissionHash],
      );
      return existing.rows[0]?.request_hash === requestHash;
    });
  }

  async createSubscriptionPurchase(
    userId: string,
    plan: PlanCode,
    idempotencyKey: string,
  ): Promise<AccountProfile | null> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const user = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id=$1 AND status='active' FOR UPDATE",
        [userId],
      );
      if (user.rowCount !== 1) return null;
      const previousPurchase = await client.query(
        `SELECT id FROM simulated_purchases WHERE idempotency_key=$1 AND user_id=$2`,
        [idempotencyKey, userId],
      );
      if (previousPurchase.rowCount)
        return this.readProfileForUser(client, userId);

      const activePlan = await client.query(
        `SELECT id FROM subscriptions WHERE user_id=$1 AND plan_code=$2
           AND status='active' AND starts_at <= now() AND expires_at > now()
         FOR UPDATE`,
        [userId, plan],
      );
      if (activePlan.rowCount) throw new Error("PLAN_ALREADY_ACTIVE");

      await client.query(
        `UPDATE subscriptions SET status='expired'
         WHERE user_id=$1 AND plan_code=$2 AND status='active' AND expires_at <= now()`,
        [userId, plan],
      );
      const subscription = await client.query<{ id: string }>(
        `INSERT INTO subscriptions(user_id,plan_code,status,starts_at,expires_at,activation_source,idempotency_key)
         VALUES($1,$2,'active',now(),now()+interval '1 month','simulated',$3)
         RETURNING id`,
        [userId, plan, idempotencyKey],
      );
      const subscriptionId = subscription.rows[0]?.id;
      if (!subscriptionId) throw new Error("SUBSCRIPTION_PURCHASE_FAILED");
      await client.query(
        `INSERT INTO simulated_purchases(user_id,subscription_id,idempotency_key,status,confirmed_at,amount_eur)
         SELECT $1,$2,$3,'confirmed',now(),monthly_price_eur FROM plans WHERE code=$4`,
        [userId, subscriptionId, idempotencyKey, plan],
      );
      return this.readProfileForUser(client, userId);
    });
  }

  private async readProfile(
    connection: Pick<Pool, "query"> | PoolClient,
    refreshTokenHash: string,
  ): Promise<AccountProfile | null> {
    const result = await connection.query<{
      user_id: string;
      email: string;
      username: string;
      email_verified_at: Date | null;
      user_created_at: Date;
      roast_messages_sent: string;
      role: "user" | "admin";
      avatar_key: string | null;
      public_rankings_opt_in: boolean;
      plan_code: PlanCode;
      plan_status: "active" | "inactive";
      starts_at: Date | null;
      expires_at: Date | null;
      remaining_ideas: number;
      remaining_roasts: number;
    }>(
      `SELECT u.id AS user_id,u.email,u.username,u.role,u.email_verified_at,u.created_at AS user_created_at,u.avatar_key,
         (u.public_rankings_consent_at IS NOT NULL) AS public_rankings_opt_in,
         u.roast_messages_sent::text AS roast_messages_sent,p.code AS plan_code,
         CASE WHEN active_subscription.id IS NULL THEN 'inactive' ELSE 'active' END AS plan_status,
         active_subscription.starts_at,active_subscription.expires_at,
         CASE WHEN active_subscription.id IS NULL THEN 0
              ELSE GREATEST(0,p.ideas_per_day-COALESCE(usage.ideas_used,0)) END AS remaining_ideas,
         CASE WHEN active_subscription.id IS NULL THEN 0
              ELSE GREATEST(0,p.roasts_per_day-COALESCE(usage.roasts_used,0)) END AS remaining_roasts
       FROM auth_sessions session
       JOIN users u ON u.id=session.user_id
       CROSS JOIN plans p
       LEFT JOIN LATERAL (
         SELECT s.id,s.starts_at,s.expires_at FROM subscriptions s
         WHERE s.user_id=u.id AND s.plan_code=p.code AND s.status='active'
           AND s.starts_at <= now() AND s.expires_at > now()
         ORDER BY s.starts_at DESC LIMIT 1
       ) active_subscription ON true
       LEFT JOIN account_daily_plan_usage usage
         ON usage.user_id=u.id AND usage.plan_code=p.code
           AND usage.usage_date=(now() AT TIME ZONE 'Europe/Madrid')::date
       WHERE session.refresh_token_hash=$1 AND session.revoked_at IS NULL
         AND session.expires_at > now()
       ORDER BY p.code`,
      [refreshTokenHash],
    );
    const rows = result.rows;
    const first = rows[0];
    if (!first) return null;
    return this.toAccountProfile(rows);
  }

  private async readProfileForUser(
    connection: Pick<Pool, "query"> | PoolClient,
    userId: string,
  ): Promise<AccountProfile | null> {
    const result = await connection.query<{
      user_id: string;
      email: string;
      username: string;
      email_verified_at: Date | null;
      user_created_at: Date;
      roast_messages_sent: string;
      role: "user" | "admin";
      avatar_key: string | null;
      public_rankings_opt_in: boolean;
      plan_code: PlanCode;
      plan_status: "active" | "inactive";
      starts_at: Date | null;
      expires_at: Date | null;
      remaining_ideas: number;
      remaining_roasts: number;
    }>(
      `SELECT u.id AS user_id,u.email,u.username,u.role,u.email_verified_at,u.created_at AS user_created_at,u.avatar_key,
         (u.public_rankings_consent_at IS NOT NULL) AS public_rankings_opt_in,
         u.roast_messages_sent::text AS roast_messages_sent,p.code AS plan_code,
         CASE WHEN active_subscription.id IS NULL THEN 'inactive' ELSE 'active' END AS plan_status,
         active_subscription.starts_at,active_subscription.expires_at,
         CASE WHEN active_subscription.id IS NULL THEN 0
              ELSE GREATEST(0,p.ideas_per_day-COALESCE(usage.ideas_used,0)) END AS remaining_ideas,
         CASE WHEN active_subscription.id IS NULL THEN 0
              ELSE GREATEST(0,p.roasts_per_day-COALESCE(usage.roasts_used,0)) END AS remaining_roasts
       FROM users u CROSS JOIN plans p
       LEFT JOIN LATERAL (
         SELECT s.id,s.starts_at,s.expires_at FROM subscriptions s
         WHERE s.user_id=u.id AND s.plan_code=p.code AND s.status='active'
           AND s.starts_at <= now() AND s.expires_at > now()
         ORDER BY s.starts_at DESC LIMIT 1
       ) active_subscription ON true
       LEFT JOIN account_daily_plan_usage usage
         ON usage.user_id=u.id AND usage.plan_code=p.code
           AND usage.usage_date=(now() AT TIME ZONE 'Europe/Madrid')::date
       WHERE u.id=$1
       ORDER BY p.code`,
      [userId],
    );
    return result.rows.length === 0 ? null : this.toAccountProfile(result.rows);
  }

  private toAccountProfile(
    rows: Array<{
      email: string;
      username: string;
      email_verified_at: Date | null;
      user_created_at: Date;
      roast_messages_sent: string;
      role: "user" | "admin";
      avatar_key: string | null;
      public_rankings_opt_in: boolean;
      plan_code: PlanCode;
      plan_status: "active" | "inactive";
      starts_at: Date | null;
      expires_at: Date | null;
      remaining_ideas: number;
      remaining_roasts: number;
    }>,
  ): AccountProfile {
    const first = rows[0]!;
    return {
      user: {
        email: first.email,
        username: first.username,
        role: first.role,
        emailVerified: first.email_verified_at !== null,
        createdAt: first.user_created_at.toISOString(),
        roastMessagesSent: parseRoastMessagesSent(first.roast_messages_sent),
        publicRankingsOptIn: first.public_rankings_opt_in,
        avatarUrl: first.avatar_key ? `/api/avatars/${first.avatar_key}` : null,
      },
      plans: rows.map((row): AccountPlanStatus => ({
        plan: row.plan_code,
        status: row.plan_status,
        startsAt: row.starts_at?.toISOString() ?? null,
        expiresAt: row.expires_at?.toISOString() ?? null,
        attemptsRemaining: {
          ideas: row.remaining_ideas,
          roasts: row.remaining_roasts,
        },
      })),
    };
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
  }

  private async cleanupExpiredRegistrationIntents(
    connection: Pick<Pool, "query"> | PoolClient,
  ): Promise<void> {
    await connection.query(
      `WITH expired AS (
         SELECT token_hash FROM registration_intents
         WHERE expires_at <= now()
         ORDER BY expires_at,token_hash
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       DELETE FROM registration_intents intent
       USING expired
       WHERE intent.token_hash=expired.token_hash`,
      [REGISTRATION_INTENT_CLEANUP_BATCH],
    );
  }

  private async cleanupStaleAuthSessions(
    connection: Pick<Pool, "query"> | PoolClient,
  ): Promise<void> {
    await connection.query(
      `WITH stale AS (
         SELECT id FROM auth_sessions
         WHERE revoked_at IS NOT NULL
         ORDER BY revoked_at,id
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       ), expired AS (
         SELECT id FROM auth_sessions
         WHERE revoked_at IS NULL AND expires_at <= now()
         ORDER BY expires_at,id
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       ), candidates AS (
         SELECT id FROM stale
         UNION
         SELECT id FROM expired
         LIMIT $1
       )
       DELETE FROM auth_sessions session
       USING candidates
       WHERE session.id=candidates.id`,
      [AUTH_SESSION_CLEANUP_BATCH],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
