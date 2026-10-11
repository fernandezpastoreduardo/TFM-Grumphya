import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Pool } from "pg";

@Controller("health")
export class HealthController {
  private readonly pool = new Pool({
    host: process.env.PGHOST ?? "/tmp",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "grumphya_dev",
    user: process.env.PGUSER ?? process.env.USER,
    password: process.env.PGPASSWORD,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : undefined,
    connectionTimeoutMillis: 2_000,
  });

  @Get()
  async check() {
    try {
      const { rows } = await this.pool.query<{ version: string }>(
        "select extversion as version from pg_extension where extname = 'vector'",
      );
      if (!rows[0]) throw new Error("pgvector extension is not enabled");
      return { status: "ok", database: "ok", pgvector: rows[0].version };
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        database: "unavailable",
      });
    }
  }
}
