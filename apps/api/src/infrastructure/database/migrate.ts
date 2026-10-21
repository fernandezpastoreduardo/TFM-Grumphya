import { createPostgresPool } from "./postgres-pool";
import { runMigrations } from "./run-migrations";

async function migrate(): Promise<void> {
  const pool = createPostgresPool();
  try {
    await runMigrations(pool);
    console.log("Database migrations completed.");
  } catch {
    console.error(
      "Database migration failed. API startup is blocked; inspect the database and migration version, then restore a backup or fix the migration before retrying.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void migrate();
