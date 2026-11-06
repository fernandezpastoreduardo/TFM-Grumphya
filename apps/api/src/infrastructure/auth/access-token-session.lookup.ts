import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { createPostgresPool } from "../database/postgres-pool";

export interface AccessTokenSessionLookup {
  isActive(accessTokenHash: string, userId: string): Promise<boolean>;
}

export const ACCESS_TOKEN_SESSION_LOOKUP = Symbol(
  "ACCESS_TOKEN_SESSION_LOOKUP",
);

@Injectable()
export class PostgresAccessTokenSessionLookup implements AccessTokenSessionLookup {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async isActive(accessTokenHash: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM auth_sessions session
       JOIN users user_account ON user_account.id=session.user_id
       WHERE session.access_token_hash=$1 AND session.user_id=$2
         AND session.revoked_at IS NULL AND session.expires_at > now()
         AND user_account.status='active'
         AND user_account.email_verified_at IS NOT NULL`,
      [accessTokenHash, userId],
    );
    return result.rowCount === 1;
  }
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
