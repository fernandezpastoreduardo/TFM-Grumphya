import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RegistrationError } from "./registration.models";
import {
  REGISTRATION_REPOSITORY,
  type RegistrationRepository,
} from "./registration.repository";
import { RegistrationService } from "./registration.service";
import { readCookie } from "../infrastructure/http/read-cookie";
import { privateCookieOptions } from "../infrastructure/http/private-cookie-options";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";

const INTENT_COOKIE = "grumphya_registration_intent";
const VERIFIED_COOKIE = "grumphya_verified_registration";
const REFRESH_COOKIE = "grumphya_refresh";
const INTENT_COOKIE_OPTIONS = privateCookieOptions(15 * 60 * 1000);
type AuthenticatedRequest = Request & { user?: { userId: string } };

@Controller()
export class RegistrationController {
  private readonly service: RegistrationService;
  constructor(
    @Inject(REGISTRATION_REPOSITORY) repository: RegistrationRepository,
  ) {
    this.service = new RegistrationService(repository);
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
  async register(
    @Req() request: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.service.register(
      readCookie(request, INTENT_COOKIE),
      body,
    );
    response.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      sessionCookieOptions(session),
    );
    response.clearCookie(INTENT_COOKIE, privateCookieOptions());
    return session.result;
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
      sessionCookieOptions(session),
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
      sessionCookieOptions(session),
    );
    return session.result;
  }

  @Post("auth/login")
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.service.login(body);
    response.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      sessionCookieOptions(session),
    );
    return session.result;
  }

  @Post("auth/logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.service.logout(readCookie(request, REFRESH_COOKIE));
    response.clearCookie(REFRESH_COOKIE, privateCookieOptions());
    return { status: "signed_out" };
  }

  @Get("account/profile")
  @UseGuards(AccessTokenGuard)
  async accountProfile(@Req() request: AuthenticatedRequest) {
    return this.service.getUserProfile(requireUserId(request));
  }

  @Get("account/good-ideas")
  @UseGuards(AccessTokenGuard)
  async goodIdeas(@Req() request: AuthenticatedRequest) {
    return this.service.getUserGoodIdeas(requireUserId(request));
  }

  @Post("account/subscriptions/cancel")
  @UseGuards(AccessTokenGuard)
  async cancelPlan(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (!hasOnlyKeys(body, ["plan"]))
      throw new RegistrationError(
        400,
        "INVALID_PLAN",
        "Selecciona un plan válido.",
      );
    const plan = isRecord(body) ? body.plan : undefined;
    return this.service.cancelPlanForUser(requireUserId(request), plan);
  }

}

function sessionCookieOptions(session: { rememberMe: boolean; expiresAt: Date }) {
  const maxAge = session.rememberMe
    ? Math.max(
        0,
        Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000) * 1000,
      )
    : undefined;
  return privateCookieOptions(maxAge);
}
function requireUserId(request: AuthenticatedRequest): string {
  const userId = request.user?.userId;
  if (!userId)
    throw new UnauthorizedException({
      statusCode: 401,
      code: "SESSION_REQUIRED",
      message: "Tu sesión ha caducado. Inicia sesión para continuar.",
    });
  return userId;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnlyKeys(value: unknown, allowedKeys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
