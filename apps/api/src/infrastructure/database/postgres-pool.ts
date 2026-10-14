import { Pool } from "pg";

const POSTGRES_CONNECTION_TIMEOUT_MS = 2_000;

export function createPostgresPool(): Pool {
  return new Pool({
    host: process.env.PGHOST ?? "/tmp",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "grumphya_dev",
    user: process.env.PGUSER ?? process.env.USER,
    password: process.env.PGPASSWORD,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : undefined,
    connectionTimeoutMillis: POSTGRES_CONNECTION_TIMEOUT_MS,
  });
}
