import { createHash, randomBytes } from "node:crypto";
import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  AnonymousUsageRepository,
  AnonymousUsageScope,
  AnonymousUsageState,
  ReservationResult,
} from "./anonymous-usage.models";
import { ANONYMOUS_USAGE_REPOSITORY } from "./anonymous-usage.models";
import {
  AnonymousIpLimitError,
  hashAnonymousIp,
} from "./postgres-anonymous-usage.repository";

const VISITOR_TOKEN_BYTES = 32;
const VISITOR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const IDEMPOTENCY_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const IP_TEMPORARY_LIMIT_MESSAGE =
  "Se han creado demasiados perfiles desde esta red. Inténtalo más tarde.";

export class AnonymousQuotaExhaustedError extends HttpException {
  constructor(scope: AnonymousUsageScope) {
    super(
      {
        code: "ANONYMOUS_QUOTA_EXHAUSTED",
        scope,
        remaining: 0,
        message:
          scope === "ideas"
            ? "Has agotado tus tres evaluaciones gratuitas. Consulta los planes para continuar."
            : "Has agotado tus tres envíos gratuitos. Consulta los planes para continuar.",
      },
      429,
    );
  }
}

export class AnonymousProfileRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        code: "ANONYMOUS_PROFILE_RATE_LIMITED",
        message: IP_TEMPORARY_LIMIT_MESSAGE,
      },
      429,
    );
  }
}

@Injectable()
export class AnonymousUsageService {
  private readonly ipHmacSecret: string;

  constructor(
    @Inject(ANONYMOUS_USAGE_REPOSITORY)
    private readonly repository: AnonymousUsageRepository,
    @Optional() @Inject("ANONYMOUS_IP_HMAC_SECRET") ipHmacSecret?: string,
  ) {
    this.ipHmacSecret =
      ipHmacSecret ?? process.env.ANONYMOUS_IP_HMAC_SECRET ?? "";
  }

  async initialize(
    cookieToken: unknown,
    ip: string,
  ): Promise<{ token: string; usage: AnonymousUsageState }> {
    const token = this.isVisitorToken(cookieToken)
      ? cookieToken
      : randomBytes(VISITOR_TOKEN_BYTES).toString("base64url");
    try {
      await this.repository.initialize(
        this.hashToken(token),
        hashAnonymousIp(ip, this.ipHmacSecret),
      );
    } catch (error) {
      if (error instanceof AnonymousIpLimitError) {
        throw new AnonymousProfileRateLimitException(error.retryAfterSeconds);
      }
      throw error;
    }
    const usage = await this.repository.getUsage(this.hashToken(token));
    if (!usage)
      throw new UnauthorizedException({
        code: "ANONYMOUS_PROFILE_UNAVAILABLE",
      });
    return { token, usage };
  }

  async getUsage(cookieToken: unknown): Promise<AnonymousUsageState> {
    const tokenHash = this.requireTokenHash(cookieToken);
    const usage = await this.repository.getUsage(tokenHash);
    if (!usage)
      throw new UnauthorizedException({ code: "ANONYMOUS_PROFILE_REQUIRED" });
    return usage;
  }

  async assertAvailable(
    cookieToken: unknown,
    scope: AnonymousUsageScope,
  ): Promise<void> {
    const usage = await this.getUsage(cookieToken);
    if (usage[scope].remaining < 1)
      throw new AnonymousQuotaExhaustedError(scope);
  }

  async reserve(
    cookieToken: unknown,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<ReservationResult> {
    if (
      !IDEMPOTENCY_HASH_PATTERN.test(idempotencyHash) ||
      !IDEMPOTENCY_HASH_PATTERN.test(requestHash)
    ) {
      throw new ConflictException({ code: "INVALID_IDEMPOTENCY_KEY" });
    }
    try {
      return await this.repository.reserve(
        this.requireTokenHash(cookieToken),
        scope,
        idempotencyHash,
        requestHash,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "ANONYMOUS_QUOTA_EXHAUSTED"
      ) {
        throw new AnonymousQuotaExhaustedError(scope);
      }
      if (
        error instanceof Error &&
        (error.message === "IDEMPOTENCY_CONFLICT" ||
          error.message === "REQUEST_IN_PROGRESS")
      ) {
        throw new ConflictException({ code: error.message });
      }
      throw error;
    }
  }

  async commit(
    cookieToken: unknown,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
    requestHash: string,
    response: unknown,
  ): Promise<AnonymousUsageState> {
    return this.repository.commit(
      this.requireTokenHash(cookieToken),
      scope,
      idempotencyHash,
      requestHash,
      response,
    );
  }

  async release(
    cookieToken: unknown,
    scope: AnonymousUsageScope,
    idempotencyHash: string,
  ): Promise<void> {
    await this.repository.release(
      this.requireTokenHash(cookieToken),
      scope,
      idempotencyHash,
    );
  }

  private requireTokenHash(token: unknown): string {
    if (!this.isVisitorToken(token))
      throw new UnauthorizedException({ code: "ANONYMOUS_PROFILE_REQUIRED" });
    return this.hashToken(token);
  }

  private isVisitorToken(token: unknown): token is string {
    return typeof token === "string" && VISITOR_TOKEN_PATTERN.test(token);
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
