import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { createPostgresPool } from "./infrastructure/database/postgres-pool";

@Controller("health")
export class HealthController {
  private readonly pool = createPostgresPool();

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
