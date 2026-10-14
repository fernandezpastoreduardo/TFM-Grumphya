import { type Pool, type PoolClient } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import type {
  ConfirmedRegistration,
  PlanCode,
  PendingRegistration,
  RegistrationInput,
  SessionIdentity,
  VerifiedResult,
} from "./registration.models";
import type { RegistrationRepository } from "./registration.repository";
import { runMigrations } from "../infrastructure/database/run-migrations";

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
         VALUES($1,$2,$3,$4,$5,'v1',now(),'pending_email_verification') RETURNING id`,
        [
          input.email.trim(),
          email,
          input.username.trim(),
          username,
          passwordHash,
        ],
      );
      const userId = user.rows[0]!.id;
      const pending = await client.query<{ id: string }>(
        `INSERT INTO pending_registrations(user_id,plan_code,verification_token_hash,verification_expires_at)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [userId, plan, verificationHash, verificationExpiresAt],
      );
      return {
        id: pending.rows[0]!.id,
        email: input.email.trim(),
        username: input.username.trim(),
        passwordHash,
        plan,
        verificationHash,
        verificationExpiresAt,
      };
    });
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
           VALUES($1,$2,'active',now(),now()+interval '1 month','simulated',$3) RETURNING id`,
          [registration.user_id, registration.plan_code, registration.id],
        );
        await client.query(
          `INSERT INTO simulated_purchases(user_id,subscription_id,idempotency_key,status,confirmed_at)
           VALUES($1,$2,$3,'confirmed',now())`,
          [registration.user_id, subscription.rows[0]!.id, registration.id],
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

  async createSession(
    userId: string,
    accessTokenHash: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      "INSERT INTO auth_sessions(user_id,access_token_hash,refresh_token_hash,expires_at) VALUES($1,$2,$3,$4)",
      [userId, accessTokenHash, refreshTokenHash, expiresAt],
    );
  }

  async rotateSession(
    refreshTokenHash: string,
    accessTokenHash: string,
    nextRefreshTokenHash: string,
    expiresAt: Date,
  ): Promise<SessionIdentity> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const found = await client.query<{
        id: string;
        user_id: string;
        username: string;
        plan_code: PlanCode;
      }>(
        `SELECT s.id,s.user_id,u.username,active_plan.plan_code FROM auth_sessions s
         JOIN users u ON u.id=s.user_id
         CROSS JOIN LATERAL (
           SELECT plan_code FROM subscriptions
           WHERE user_id=s.user_id AND status='active' AND starts_at <= now() AND expires_at > now()
           ORDER BY starts_at DESC LIMIT 1
         ) active_plan
         WHERE s.refresh_token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()
         FOR UPDATE OF s`,
        [refreshTokenHash],
      );
      const identity = found.rows[0];
      if (!identity) throw new Error("Refresh token unavailable.");
      const rotated = await client.query(
        `UPDATE auth_sessions SET access_token_hash=$2,refresh_token_hash=$3
         WHERE id=$1 AND refresh_token_hash=$4 AND expires_at <= $5`,
        [
          identity.id,
          accessTokenHash,
          nextRefreshTokenHash,
          refreshTokenHash,
          expiresAt,
        ],
      );
      if (rotated.rowCount !== 1) throw new Error("Refresh token unavailable.");
      return {
        userId: identity.user_id,
        username: identity.username,
        plan: identity.plan_code,
      };
    });
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
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
