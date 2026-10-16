import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Optional,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash, createHmac } from "node:crypto";
import {
  AnonymousProfileRateLimitException,
  AnonymousUsageService,
} from "./anonymous-usage.service";
import { readCookie } from "../infrastructure/http/read-cookie";
import { privateCookieOptions } from "../infrastructure/http/private-cookie-options";
import { OptionalAccessTokenGuard } from "../infrastructure/auth/optional-access-token.guard";
import { PlanUsageService } from "../register-with-plan/plan-usage.service";
import { ServiceUnavailableException } from "@nestjs/common";

const VISITOR_COOKIE = "grumphya_anon";
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60 * 1000;
const ROAST_REPLY =
  "He recibido tu mensaje. Mi respuesta definitiva todavía está de vacaciones.";
const ROAST_MAX_LENGTH = 400;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INVALID_ROAST_SUBMISSION = {
  code: "INVALID_ROAST_SUBMISSION",
  message: "No se ha podido enviar el mensaje.",
};
const PLAN_USAGE_UNAVAILABLE = {
  code: "PLAN_USAGE_UNAVAILABLE",
  message: "No se ha podido comprobar el uso de tu plan ahora.",
};

type OptionalAuthenticatedRequest = Request & {
  user?: { userId: string };
};

@Controller()
export class AnonymousUsageController {
  constructor(
    @Inject(AnonymousUsageService)
    private readonly usage: AnonymousUsageService,
    @Optional() @Inject(PlanUsageService)
    private readonly planUsage?: PlanUsageService,
  ) {}

  @Post("anonymous-usage")
  async initialize(
    @Req() request: Request,
    @Body() input: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!isEmptyRecord(input)) {
      throw new BadRequestException({
        code: "INVALID_ANONYMOUS_USAGE_REQUEST",
        message: "No se ha podido cargar el uso anónimo.",
      });
    }
    let result: Awaited<ReturnType<AnonymousUsageService["initialize"]>>;
    try {
      result = await this.usage.initialize(
        readCookie(request, VISITOR_COOKIE),
        clientIp(request),
      );
    } catch (error) {
      if (error instanceof AnonymousProfileRateLimitException) {
        response.setHeader("Retry-After", String(error.retryAfterSeconds));
      }
      throw error;
    }
    response.cookie(
      VISITOR_COOKIE,
      result.token,
      privateCookieOptions(COOKIE_MAX_AGE),
    );
    return result.usage;
  }

  @Post("roast")
  @UseGuards(OptionalAccessTokenGuard)
  async roast(
    @Req() request: OptionalAuthenticatedRequest,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey: unknown,
  ) {
    const message = parseRoastMessage(input);
    if (
      typeof idempotencyKey !== "string" ||
      !UUID_PATTERN.test(idempotencyKey)
    ) {
      throw new BadRequestException(INVALID_ROAST_SUBMISSION);
    }
    const canonicalIdempotencyKey = idempotencyKey.toLowerCase();
    const keyHash = createHash("sha256")
      .update(canonicalIdempotencyKey)
      .digest("hex");
    const requestHash = createHmac("sha256", canonicalIdempotencyKey)
      .update(message)
      .digest("hex");
    const userId = request.user?.userId;
    if (userId) {
      if (!this.planUsage)
        throw new ServiceUnavailableException(PLAN_USAGE_UNAVAILABLE);
      const reservation = await this.planUsage.reserve(
        userId,
        "roasts",
        keyHash,
        requestHash,
      );
      if (reservation.state === "cached") return reservation.response;
      try {
        const result = { reply: ROAST_REPLY };
        await this.planUsage.commit(
          userId,
          "roasts",
          keyHash,
          requestHash,
          result,
        );
        return result;
      } catch (error) {
        await this.planUsage.release(userId, "roasts", keyHash);
        throw error;
      }
    }
    const reservation = await this.usage.reserve(
      readCookie(request, VISITOR_COOKIE),
      "roasts",
      keyHash,
      requestHash,
    );
    if (reservation.state === "cached") return reservation.response;
    try {
      const result = { reply: ROAST_REPLY };
      await this.usage.commit(
        readCookie(request, VISITOR_COOKIE),
        "roasts",
        keyHash,
        requestHash,
        result,
      );
      return result;
    } catch (error) {
      await this.usage.release(
        readCookie(request, VISITOR_COOKIE),
        "roasts",
        keyHash,
      );
      throw error;
    }
  }
}

function parseRoastMessage(input: unknown): string {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BadRequestException(INVALID_ROAST_SUBMISSION);
  }
  const record = input as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => key !== "message") ||
    typeof record.message !== "string"
  ) {
    throw new BadRequestException(INVALID_ROAST_SUBMISSION);
  }
  const message = record.message.trim();
  if (
    message.length < 1 ||
    message.length > ROAST_MAX_LENGTH ||
    hasControlCharacters(message)
  ) {
    throw new BadRequestException({
      code: "INVALID_ROAST_SUBMISSION",
      message: "No se ha podido enviar el mensaje.",
    });
  }
  return message;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    );
  });
}

function isEmptyRecord(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).length === 0
  );
}

function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? "unknown";
}
