import {
  ArgumentsHost,
  Catch,
  HttpException,
  Inject,
  Logger,
} from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";
import {
  ADMIN_DASHBOARD_REPOSITORY,
  type AdminDashboardRepository,
} from "./admin-dashboard.models";

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,100}$/u;
const SAFE_DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9_]{0,99}$/u;
const FIRST_PERSISTED_ERROR_STATUS = 500;

@Catch()
export class ApplicationErrorFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(ApplicationErrorFilter.name);

  constructor(
    adapterHost: HttpAdapterHost,
    @Inject(ADMIN_DASHBOARD_REPOSITORY)
    private readonly repository: AdminDashboardRepository,
  ) {
    super(adapterHost.httpAdapter);
  }

  override async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : 500;
    if (statusCode >= FIRST_PERSISTED_ERROR_STATUS) {
      const errorCode = readErrorCode(exception, statusCode);
      const diagnosticCode = readDiagnosticCode(exception);
      try {
        await this.repository.recordApplicationError(
          errorCode,
          statusCode,
          diagnosticCode,
        );
      } catch {
        this.logger.error("APPLICATION_ERROR_PERSISTENCE_FAILED");
      }
    }
    super.catch(exception, host);
  }
}

function readDiagnosticCode(exception: unknown): string | undefined {
  if (typeof exception !== "object" || exception === null) return undefined;
  if (!("applicationErrorDiagnostic" in exception)) return undefined;
  const diagnosticCode = exception.applicationErrorDiagnostic;
  return typeof diagnosticCode === "string" &&
    SAFE_DIAGNOSTIC_CODE_PATTERN.test(diagnosticCode)
    ? diagnosticCode
    : undefined;
}

function readErrorCode(exception: unknown, statusCode: number): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (
      typeof response === "object" &&
      response !== null &&
      "code" in response &&
      typeof response.code === "string" &&
      SAFE_ERROR_CODE_PATTERN.test(response.code)
    ) {
      return response.code;
    }
  }
  return `HTTP_${statusCode}`;
}
