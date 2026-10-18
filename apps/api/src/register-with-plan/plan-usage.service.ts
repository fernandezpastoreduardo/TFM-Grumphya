import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  PLAN_USAGE_REPOSITORY,
  type PlanUsageRepository,
  type PlanUsageScope,
  type PlanUsageReservation,
} from "./plan-usage.models";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const INVALID_RESERVATION = { code: "INVALID_IDEMPOTENCY_KEY" };
const IDEMPOTENCY_CONFLICT = { code: "IDEMPOTENCY_CONFLICT" };
const REQUEST_IN_PROGRESS = { code: "REQUEST_IN_PROGRESS" };
const QUOTA_EXHAUSTED = {
  code: "PLAN_QUOTA_EXHAUSTED",
  message: "Has agotado los intentos disponibles de tu plan para hoy.",
};
const SUBSCRIPTION_REQUIRED = {
  code: "ACTIVE_PLAN_REQUIRED",
  message: "Necesitas un plan activo para usar esta función.",
};
const USAGE_UNAVAILABLE = {
  code: "PLAN_USAGE_UNAVAILABLE",
  message: "No se ha podido comprobar el uso de tu plan ahora.",
};

@Injectable()
export class PlanUsageService {
  constructor(
    @Inject(PLAN_USAGE_REPOSITORY)
    private readonly repository: PlanUsageRepository,
  ) {}

  async reserve(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<PlanUsageReservation> {
    if (
      !UUID_PATTERN.test(userId) ||
      !isScope(scope) ||
      !HASH_PATTERN.test(idempotencyHash) ||
      !HASH_PATTERN.test(requestHash)
    ) {
      throw new ConflictException(INVALID_RESERVATION);
    }
    try {
      return await this.repository.reserve(
        userId,
        scope,
        idempotencyHash,
        requestHash,
      );
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "PLAN_QUOTA_EXHAUSTED")
          throw new HttpException(
            { ...QUOTA_EXHAUSTED, scope, remaining: 0 },
            429,
          );
        if (error.message === "ACTIVE_PLAN_REQUIRED")
          throw new HttpException(SUBSCRIPTION_REQUIRED, 403);
        if (error.message === "IDEMPOTENCY_CONFLICT")
          throw new ConflictException(IDEMPOTENCY_CONFLICT);
        if (error.message === "REQUEST_IN_PROGRESS")
          throw new ConflictException(REQUEST_IN_PROGRESS);
      }
      throw new ServiceUnavailableException(USAGE_UNAVAILABLE);
    }
  }

  async reserveIfPlanActive(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<PlanUsageReservation | null> {
    try {
      return await this.reserve(userId, scope, idempotencyHash, requestHash);
    } catch (error) {
      if (isActivePlanRequired(error)) return null;
      throw error;
    }
  }

  async commit(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
    requestHash: string,
    response: unknown,
  ): Promise<void> {
    try {
      await this.repository.commit(
        userId,
        scope,
        idempotencyHash,
        requestHash,
        response,
      );
    } catch (error) {
      throw this.toHttpError(error, scope);
    }
  }

  async recordHistoricalRoastMessage(
    userId: string,
    idempotencyHash: string,
  ): Promise<void> {
    if (!UUID_PATTERN.test(userId) || !HASH_PATTERN.test(idempotencyHash)) {
      throw new ConflictException(INVALID_RESERVATION);
    }
    try {
      await this.repository.recordHistoricalRoastMessage(userId, idempotencyHash);
    } catch {
      throw new ServiceUnavailableException(USAGE_UNAVAILABLE);
    }
  }

  async release(
    userId: string,
    scope: PlanUsageScope,
    idempotencyHash: string,
  ): Promise<void> {
    try {
      await this.repository.release(userId, scope, idempotencyHash);
    } catch {
      throw new ServiceUnavailableException(USAGE_UNAVAILABLE);
    }
  }

  private toHttpError(error: unknown, scope: PlanUsageScope): HttpException {
    if (error instanceof Error) {
      if (error.message === "ACTIVE_PLAN_REQUIRED")
        return new HttpException({ ...SUBSCRIPTION_REQUIRED, scope }, 403);
      if (error.message === "PLAN_QUOTA_EXHAUSTED")
        return new HttpException(
          { ...QUOTA_EXHAUSTED, scope, remaining: 0 },
          429,
        );
    }
    return new ServiceUnavailableException(USAGE_UNAVAILABLE);
  }
}

function isActivePlanRequired(error: unknown): boolean {
  if (!(error instanceof HttpException) || error.getStatus() !== 403) {
    return false;
  }
  const response = error.getResponse();
  return (
    typeof response === "object" &&
    response !== null &&
    "code" in response &&
    response.code === "ACTIVE_PLAN_REQUIRED"
  );
}

function isScope(value: unknown): value is PlanUsageScope {
  return value === "ideas" || value === "roasts";
}
