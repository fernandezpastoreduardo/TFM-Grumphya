import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RegistrationError } from "./registration.models";
import {
  REGISTRATION_REPOSITORY,
  type RegistrationRepository,
} from "./registration.repository";
import { RegistrationService } from "./registration.service";
import { DevelopmentVerificationDelivery } from "./verification-delivery";
import { readCookie } from "../infrastructure/http/read-cookie";
import { privateCookieOptions } from "../infrastructure/http/private-cookie-options";

const INTENT_COOKIE = "grumphya_registration_intent";
const VERIFIED_COOKIE = "grumphya_verified_registration";
const REFRESH_COOKIE = "grumphya_refresh";
const INTENT_COOKIE_OPTIONS = privateCookieOptions(15 * 60 * 1000);

@Controller()
export class RegistrationController {
  private readonly service: RegistrationService;
  constructor(
    @Inject(REGISTRATION_REPOSITORY) repository: RegistrationRepository,
    @Inject(DevelopmentVerificationDelivery)
    private readonly delivery: DevelopmentVerificationDelivery,
  ) {
    this.service = new RegistrationService(repository, delivery);
  }

  @Post("registration-intents")
  async createIntent(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!hasOnlyKeys(body, ["plan"]))
      throw new RegistrationError(
        400,
        "INVALID_PLAN",
        "Selecciona un plan válido.",
      );
    const plan = isRecord(body) ? body.plan : undefined;
    const intent = await this.service.createIntent(plan);
    response.cookie(INTENT_COOKIE, intent.token, INTENT_COOKIE_OPTIONS);
    return { expiresAt: intent.expiresAt.toISOString() };
  }

  @Get("registration-intents/current")
  async currentIntent(@Req() request: Request) {
    const plan = await this.service.currentIntent(
      readCookie(request, INTENT_COOKIE),
    );
    if (!plan)
      throw new RegistrationError(
        404,
        "REGISTRATION_INTENT_NOT_FOUND",
        "No hay un plan pendiente.",
      );
    return { plan };
  }

  @Post("registrations")
  @HttpCode(202)
  async register(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.register(
      readCookie(request, INTENT_COOKIE),
      body,
    );
    response.clearCookie(INTENT_COOKIE, privateCookieOptions());
    return result;
  }

  @Post("registrations/verify")
  async verify(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!hasOnlyKeys(body, ["token"]))
      throw new RegistrationError(
        400,
        "INVALID_VERIFICATION",
        "El enlace no es válido o ha caducado.",
      );
    const token = isRecord(body) ? body.token : undefined;
    if (typeof token !== "string")
      throw new RegistrationError(
        400,
        "INVALID_VERIFICATION",
        "El enlace no es válido o ha caducado.",
      );
    const verified = await this.service.verify(token);
    response.cookie(
      VERIFIED_COOKIE,
      verified.confirmationToken,
      INTENT_COOKIE_OPTIONS,
    );
    return verified.result;
  }

  @Post("registrations/confirm")
  async confirm(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.service.confirm(
      readCookie(request, VERIFIED_COOKIE),
    );
    response.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      sessionCookieOptions(),
    );
    response.clearCookie(VERIFIED_COOKIE, privateCookieOptions());
    return session.result;
  }

  @Post("auth/refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.service.refresh(
      readCookie(request, REFRESH_COOKIE),
    );
    response.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      sessionCookieOptions(),
    );
    return session.result;
  }

  @Get("registration-test-mail/latest")
  latestTestMail(@Req() request: Request) {
    if (
      process.env.NODE_ENV === "production" ||
      !isLoopback(request.ip ?? request.socket.remoteAddress ?? "")
    ) {
      throw new RegistrationError(404, "NOT_FOUND", "No encontrado.");
    }
    const latest = this.delivery.getLatest();
    if (!latest)
      throw new RegistrationError(
        404,
        "NOT_FOUND",
        "No hay mensajes pendientes.",
      );
    const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173";
    return { verificationUrl: `${webOrigin}/verificar-cuenta#${latest.token}` };
  }
}

function sessionCookieOptions() {
  return privateCookieOptions();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnlyKeys(value: unknown, allowedKeys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
function isLoopback(address: string): boolean {
  return (
    address === "::1" ||
    address === "127.0.0.1" ||
    address === "::ffff:127.0.0.1"
  );
}
