import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ADMIN_DASHBOARD_REPOSITORY,
  type AdminDashboardRepository,
} from "./admin-dashboard.models";
import { LoginAbuseProtection } from "../security/login-abuse-protection.service";

const INVALID_ERROR_EVENT_ID_MESSAGE =
  "El identificador del error no es válido.";
const ERROR_EVENT_NOT_FOUND_MESSAGE = "No se ha encontrado ese error.";
const ERROR_DETAIL_UNAVAILABLE_MESSAGE =
  "No se ha podido consultar el detalle del error.";
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function isPostgresBigintId(value: string): boolean {
  if (!/^[1-9]\d{0,18}$/u.test(value)) return false;
  return BigInt(value) <= MAX_POSTGRES_BIGINT;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @Inject(ADMIN_DASHBOARD_REPOSITORY)
    private readonly repository: AdminDashboardRepository,
    @Optional()
    @Inject(LoginAbuseProtection)
    private readonly loginAbuseProtection = new LoginAbuseProtection(),
  ) {}

  async getSnapshot() {
    try {
      const snapshot = await this.repository.getSnapshot();
      return {
        ...snapshot,
        loginSecurity: this.loginAbuseProtection.getAdminSnapshot(),
      };
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

  async getApplicationError(id: string) {
    if (!isPostgresBigintId(id)) {
      throw new BadRequestException({
        code: "INVALID_APPLICATION_ERROR_ID",
        message: INVALID_ERROR_EVENT_ID_MESSAGE,
      });
    }
    try {
      const detail = await this.repository.getApplicationError(id);
      if (!detail) {
        throw new NotFoundException({
          code: "APPLICATION_ERROR_NOT_FOUND",
          message: ERROR_EVENT_NOT_FOUND_MESSAGE,
        });
      }
      return detail;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error("ADMIN_APPLICATION_ERROR_UNAVAILABLE");
      throw new ServiceUnavailableException({
        code: "ADMIN_APPLICATION_ERROR_UNAVAILABLE",
        message: ERROR_DETAIL_UNAVAILABLE_MESSAGE,
      });
    }
  }
}
