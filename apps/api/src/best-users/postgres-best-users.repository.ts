import { Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type { BestUserItem, BestUsersRepository } from "./best-users.models";
import { MAX_BEST_USERS } from "./best-users.models";
import { publicAvatarUrl } from "../infrastructure/avatar/public-avatar-url";

interface BestUserRow {
  username: string;
  approved_ideas_count: number | string;
  avatar_key: string | null;
}

export class PostgresBestUsersRepository implements BestUsersRepository {
  private readonly pool: Pool;
  private ready?: Promise<void>;

  constructor(
    pool?: Pool,
    private readonly migrationRunner: (
      pool: Pool,
    ) => Promise<void> = runMigrations,
  ) {
    this.pool = pool ?? createPostgresPool();
  }

  async getBestListBestUsers(): Promise<BestUserItem[]> {
    await this.ensureSchema();
    const result = await this.pool.query<BestUserRow>(
      `SELECT users.username, users.avatar_key,
              COUNT(DISTINCT approved.id) AS approved_ideas_count
       FROM users
       JOIN approved_ideas AS approved ON approved.user_id = users.id
       WHERE users.status = 'active'
         AND users.public_rankings_consent_at IS NOT NULL
       GROUP BY users.id, users.username
       ORDER BY approved_ideas_count DESC, users.username ASC
       LIMIT ${MAX_BEST_USERS}`,
    );

    return result.rows.map((row) => ({
      username: row.username,
      approvedIdeasCount: Number(row.approved_ideas_count),
      ...(row.avatar_key ? { avatarUrl: publicAvatarUrl(row.avatar_key) } : {}),
    }));
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.migrationRunner(this.pool);
    await this.ready;
  }
}
