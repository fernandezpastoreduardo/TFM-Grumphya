import {
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PostgresScanStore } from "@grumphya/development-security-persistence";
import { Pool } from "pg";

@Injectable()
export class DevelopmentSecurityDatabase implements OnApplicationShutdown {
  readonly scanStore: PostgresScanStore;

  constructor() {
    const connectionString = process.env.DS_DATABASE_URL;
    if (!connectionString) {
      throw new Error("development_security_database_not_configured");
    }
    this.scanStore = new PostgresScanStore(
      new Pool({ connectionString, max: 3 }),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.scanStore.close();
  }
}

@Injectable()
export class DevelopmentSecurityHealthService {
  constructor(
    @Inject(DevelopmentSecurityDatabase)
    private readonly database: {
      scanStore: Pick<PostgresScanStore, "healthCheck">;
    },
  ) {}

  async isStorageAvailable(): Promise<boolean> {
    return this.database.scanStore.healthCheck();
  }
}

@Controller("health")
export class DevelopmentSecurityHealthController {
  constructor(private readonly health: DevelopmentSecurityHealthService) {}

  @Get()
  async getHealth(): Promise<{ status: "ok" }> {
    if (!(await this.health.isStorageAvailable())) {
      throw new ServiceUnavailableException("development_security_unavailable");
    }
    return { status: "ok" };
  }
}

@Module({
  controllers: [DevelopmentSecurityHealthController],
  providers: [DevelopmentSecurityDatabase, DevelopmentSecurityHealthService],
})
export class DevelopmentSecurityApiModule {}
