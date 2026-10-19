import { Pool } from "pg";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import type { ContactMessageRepository } from "./submit-contact-message.models";

export class PostgresContactMessageRepository implements ContactMessageRepository {
  private readonly pool: Pool;
  private ready: Promise<void> | undefined;

  constructor(
    pool?: Pool,
    private readonly migrationRunner: (
      pool: Pool,
    ) => Promise<void> = runMigrations,
  ) {
    this.pool = pool ?? createPostgresPool();
  }

  async createForUser(
    userId: string,
    subject: string,
    message: string,
  ): Promise<void> {
    await this.ensureReady();
    await this.pool.query(
      `INSERT INTO contact_messages (user_id, subject, message)
       VALUES ($1, $2, $3)`,
      [userId, subject, message],
    );
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.migrationRunner(this.pool);
    await this.ready;
  }
}
