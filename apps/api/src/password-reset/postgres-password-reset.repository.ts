import { Injectable } from "@nestjs/common";
import { type Pool, type PoolClient } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import type {
  PasswordResetRepository,
  PasswordResetTarget,
} from "./password-reset.repository";

@Injectable()
export class PostgresPasswordResetRepository implements PasswordResetRepository {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async replaceToken(
    normalizedEmail: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<PasswordResetTarget | null> {
    const result = await this.pool.query<{
      user_id: string;
      email: string;
    }>(
      `INSERT INTO password_reset_tokens
         (user_id, token_hash, expires_at, request_window_started_at, request_count, last_requested_at)
       SELECT id, $2, $3, now(), 1, now()
       FROM users
       WHERE email_normalized=$1 AND status='active' AND role='user'
         AND username_normalized <> 'jappy'
       ON CONFLICT (user_id) DO UPDATE SET
         token_hash=EXCLUDED.token_hash,
         expires_at=EXCLUDED.expires_at,
         request_count=CASE
           WHEN password_reset_tokens.request_window_started_at <= now() - interval '1 hour' THEN 1
           ELSE password_reset_tokens.request_count + 1
         END,
         request_window_started_at=CASE
           WHEN password_reset_tokens.request_window_started_at <= now() - interval '1 hour' THEN now()
           ELSE password_reset_tokens.request_window_started_at
         END,
         last_requested_at=now()
       WHERE password_reset_tokens.last_requested_at <= now() - interval '60 seconds'
         AND (password_reset_tokens.request_window_started_at <= now() - interval '1 hour'
              OR password_reset_tokens.request_count < 3)
       RETURNING user_id,
         (SELECT email FROM users WHERE id=password_reset_tokens.user_id) AS email`,
      [normalizedEmail, tokenHash, expiresAt],
    );
    const row = result.rows[0];
    return row ? { userId: row.user_id, email: row.email } : null;
  }

  async consumeToken(
    tokenHash: string,
    passwordHash: string,
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const token = await client.query<{ user_id: string }>(
        `SELECT reset.user_id
         FROM password_reset_tokens reset
         JOIN users user_account ON user_account.id=reset.user_id
         WHERE reset.token_hash=$1 AND reset.expires_at > now()
           AND user_account.status='active' AND user_account.role='user'
           AND user_account.username_normalized <> 'jappy'
         FOR UPDATE OF reset, user_account`,
        [tokenHash],
      );
      const userId = token.rows[0]?.user_id;
      if (!userId) return false;
      await client.query(
        "UPDATE users SET password_hash=$2 WHERE id=$1 AND status='active' AND role='user'",
        [userId, passwordHash],
      );
      await client.query(
        "UPDATE password_reset_tokens SET token_hash=NULL, expires_at=now() WHERE user_id=$1",
        [userId],
      );
      await client.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [userId],
      );
      return true;
    });
  }

  async invalidateToken(userId: string, tokenHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE password_reset_tokens SET token_hash=NULL, expires_at=now() WHERE user_id=$1 AND token_hash=$2",
      [userId, tokenHash],
    );
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>) {
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
