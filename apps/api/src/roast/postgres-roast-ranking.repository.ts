import { Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type {
  RoastRankingItem,
  RoastRankingRepository,
} from "./roast-ranking.models";
import { publicAvatarUrl } from "../infrastructure/avatar/public-avatar-url";

const MAX_RANKING_SIZE = 10;

type RoastRankingRow = {
  username: string;
  roast_messages_sent: number | string;
  avatar_key: string | null;
};

export class PostgresRoastRankingRepository implements RoastRankingRepository {
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

  async getRoastRanking(): Promise<RoastRankingItem[]> {
    await this.ensureSchema();
    const result = await this.pool.query<RoastRankingRow>(
      `SELECT username, roast_messages_sent, avatar_key
       FROM users
       WHERE status = 'active' AND roast_messages_sent > 0
       ORDER BY roast_messages_sent DESC, username ASC
       LIMIT ${MAX_RANKING_SIZE}`,
    );

    return result.rows.map((row) => ({
      username: row.username,
      roastMessagesSent: Number(row.roast_messages_sent),
      ...(row.avatar_key ? { avatarUrl: publicAvatarUrl(row.avatar_key) } : {}),
    }));
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= this.migrationRunner(this.pool);
    await this.ready;
  }
}
