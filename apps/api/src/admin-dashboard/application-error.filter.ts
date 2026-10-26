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
import { parseApplicationErrorContext } from "../infrastructure/observability/application-error-context";

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,100}$/u;
const SAFE_DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9_]{0,99}$/u;
const FIRST_PERSISTED_ERROR_STATUS = 500;
const IDEA_EVALUATION_PATH = "/api/evaluation-process";

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
      const context =
        readApplicationErrorContext(exception) ??
        readEvaluationRequestContext(host);
      try {
        await this.repository.recordApplicationError(
          errorCode,
          statusCode,
          diagnosticCode,
          context ?? undefined,
        );
      } catch {
        this.logger.error("APPLICATION_ERROR_PERSISTENCE_FAILED");
      }
    }
    super.catch(exception, host);
  }
}

function readEvaluationRequestContext(host: ArgumentsHost) {
  const request = host.getArgByIndex(0);
  if (typeof request !== "object" || request === null) return null;
  const candidate = request as Record<string, unknown>;
  const method = candidate.method;
  const url = candidate.originalUrl ?? candidate.url;
  if (
    method !== "POST" ||
    typeof url !== "string" ||
    url.split("?", 1)[0] !== IDEA_EVALUATION_PATH
  ) {
    return null;
  }
  const body = candidate.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  return parseApplicationErrorContext({
    useCase: "idea_evaluation",
    inputText: (body as Record<string, unknown>).ideaText,
  });
}

function readApplicationErrorContext(exception: unknown) {
  if (typeof exception !== "object" || exception === null) return null;
  if (!("applicationErrorContext" in exception)) return null;
  return parseApplicationErrorContext(exception.applicationErrorContext);
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
