import { type Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { withTransaction } from "../infrastructure/database/with-transaction";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type { UserDeleteRepository } from "./user-delete.models";
import { LocalUserAvatarStorage } from "../user-avatar/local-user-avatar.storage";
import { Logger } from "@nestjs/common";

export class PostgresUserDeleteRepository implements UserDeleteRepository {
  private readonly logger = new Logger(PostgresUserDeleteRepository.name);
  private readonly pool: Pool;
  private readonly avatarStorage = new LocalUserAvatarStorage();
  private ready?: Promise<void>;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async deleteUser(userId: string): Promise<boolean> {
    await this.ensureSchema();
    const rollbackState: { avatarBackup?: { key: string; image: Buffer } } = {};
    try {
      return await withTransaction(this.pool, async (client) => {
        const lockedUser = await client.query<{
          id: string;
          avatar_key: string | null;
        }>("SELECT id,avatar_key FROM users WHERE id=$1 FOR UPDATE", [userId]);
        if (!lockedUser.rowCount) return false;

        const avatarKey = lockedUser.rows[0]?.avatar_key ?? null;
        if (avatarKey) {
          const image = await this.avatarStorage.read(avatarKey);
          if (image) rollbackState.avatarBackup = { key: avatarKey, image };
        }

        // These historical foreign keys do not cascade. Other account-owned
        // records, including ideas, sessions and usage, cascade from users.id.
        await client.query("DELETE FROM simulated_purchases WHERE user_id=$1", [
          userId,
        ]);
        await client.query("DELETE FROM subscriptions WHERE user_id=$1", [
          userId,
        ]);
        const deletedUser = await client.query(
          "DELETE FROM users WHERE id=$1",
          [userId],
        );
        if (deletedUser.rowCount === 1 && avatarKey) {
          await this.avatarStorage.remove(avatarKey);
        }
        return deletedUser.rowCount === 1;
      });
    } catch (error) {
      const avatarBackup = rollbackState.avatarBackup;
      if (avatarBackup) {
        try {
          await this.avatarStorage.save(avatarBackup.key, avatarBackup.image);
        } catch {
          this.logger.error(
            "Could not restore account avatar after failed deletion.",
          );
        }
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
  }
}
