import { type Pool, type PoolClient } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type { UserDeleteRepository } from "./user-delete.models";

export class PostgresUserDeleteRepository implements UserDeleteRepository {
  private readonly pool: Pool;
  private ready?: Promise<void>;

  constructor(pool?: Pool) {
    this.pool = pool ?? createPostgresPool();
  }

  async deleteUser(userId: string): Promise<boolean> {
    await this.ensureSchema();
    return this.transaction(async (client) => {
      const lockedUser = await client.query<{ id: string }>(
        "SELECT id FROM users WHERE id=$1 FOR UPDATE",
        [userId],
      );
      if (!lockedUser.rowCount) return false;

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
      return deletedUser.rowCount === 1;
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureSchema(): Promise<void> {
    this.ready ??= runMigrations(this.pool);
    await this.ready;
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
