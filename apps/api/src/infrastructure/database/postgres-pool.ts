import { Pool } from "pg";

const POSTGRES_CONNECTION_TIMEOUT_MS = 2_000;
const INTERNAL_DATABASE_HOST = "db";

export function resolvePostgresSslConfig(
  environment: NodeJS.ProcessEnv = process.env,
): false | { rejectUnauthorized: true } | undefined {
  if (environment.NODE_ENV !== "production") return undefined;

  const mode = environment.PGSSL_MODE ?? "verify-full";
  if (mode === "disable-internal") {
    if (environment.PGHOST !== INTERNAL_DATABASE_HOST) {
      throw new Error(
        "PGSSL_MODE=disable-internal is allowed only for the Compose database host 'db'.",
      );
    }
    return false;
  }
  if (mode === "verify-full") return { rejectUnauthorized: true };

  throw new Error("PGSSL_MODE must be 'verify-full' or 'disable-internal'.");
}

export function createPostgresPool(): Pool {
  const host = process.env.PGHOST ?? "/tmp";
  return new Pool({
    host,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "grumphya_dev",
    user: process.env.PGUSER ?? process.env.USER,
    password: process.env.PGPASSWORD,
    ssl: resolvePostgresSslConfig(process.env),
    connectionTimeoutMillis: POSTGRES_CONNECTION_TIMEOUT_MS,
  });
}
