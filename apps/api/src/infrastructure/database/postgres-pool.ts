import { Pool } from "pg";
import { readFileSync } from "node:fs";

const POSTGRES_CONNECTION_TIMEOUT_MS = 2_000;

export function resolvePostgresSslConfig(
  environment: NodeJS.ProcessEnv = process.env,
): { rejectUnauthorized: true; ca: Buffer } | undefined {
  if (environment.NODE_ENV !== "production") return undefined;

  const mode = environment.PGSSL_MODE ?? "verify-full";
  if (mode !== "verify-full") {
    throw new Error("PGSSL_MODE must be 'verify-full' in production.");
  }

  const caFile = environment.PGSSL_CA_FILE;
  if (!caFile) {
    throw new Error("PGSSL_CA_FILE must be configured in production.");
  }
  try {
    return { rejectUnauthorized: true, ca: readFileSync(caFile) };
  } catch {
    throw new Error("PGSSL_CA_FILE must point to a readable CA certificate.");
  }
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
