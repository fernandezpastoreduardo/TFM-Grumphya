import { Injectable } from "@nestjs/common";
import { type Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type { UserAvatarRepository } from "./user-avatar.models";

@Injectable()
export class PostgresUserAvatarRepository implements UserAvatarRepository {
  private readonly pool: Pool = createPostgresPool();
  private ready?: Promise<void>;

  async replaceAvatar(
    userId: string,
    avatarKey: string,
  ): Promise<string | null> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
    const result = await this.pool.query<{ avatar_key: string | null }>(
      `WITH current AS (
         SELECT id,avatar_key FROM users WHERE id=$1 AND status='active' FOR UPDATE
       ), updated AS (
         UPDATE users SET avatar_key=$2 WHERE id IN (SELECT id FROM current)
         RETURNING id
       )
       SELECT current.avatar_key FROM current JOIN updated USING (id)`,
      [userId, avatarKey],
    );
    if (!result.rowCount) throw new Error("Active account not found.");
    return result.rows[0]?.avatar_key ?? null;
  }
}
