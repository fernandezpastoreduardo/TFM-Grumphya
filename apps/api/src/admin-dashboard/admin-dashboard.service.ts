import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ADMIN_DASHBOARD_REPOSITORY,
  type AdminDashboardRepository,
} from "./admin-dashboard.models";

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @Inject(ADMIN_DASHBOARD_REPOSITORY)
    private readonly repository: AdminDashboardRepository,
  ) {}

  async getSnapshot() {
    try {
      return await this.repository.getSnapshot();
    } catch {
      this.logger.error("ADMIN_DASHBOARD_UNAVAILABLE");
      throw new ServiceUnavailableException({
        code: "ADMIN_DASHBOARD_UNAVAILABLE",
        message: "No se han podido consultar las métricas ahora.",
      });
    }
  }

  async listContactMessages() {
    try {
      return { messages: await this.repository.listContactMessages() };
    } catch {
      this.logger.error("ADMIN_CONTACT_MESSAGES_UNAVAILABLE");
      throw new ServiceUnavailableException({
        code: "ADMIN_CONTACT_MESSAGES_UNAVAILABLE",
        message: "No se han podido consultar los mensajes ahora.",
      });
    }
  }
}
