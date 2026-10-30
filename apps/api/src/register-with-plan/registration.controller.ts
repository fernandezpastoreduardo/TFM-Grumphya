import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Optional,
  Post,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RegistrationError } from "./registration.models";
import { RegistrationService } from "./registration.service";
import { readCookie } from "../infrastructure/http/read-cookie";
import { privateCookieOptions } from "../infrastructure/http/private-cookie-options";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { LoginAbuseProtection } from "../security/login-abuse-protection.service";

const INTENT_COOKIE = "grumphya_registration_intent";
const VERIFIED_COOKIE = "grumphya_verified_registration";
const REFRESH_COOKIE = "grumphya_refresh";
const INTENT_COOKIE_OPTIONS = privateCookieOptions(15 * 60 * 1000);
type AuthenticatedRequest = Request & { user?: { userId: string } };

@Controller()
export class RegistrationController {
  private readonly service: RegistrationService;
  private readonly loginAbuseProtection: LoginAbuseProtection;
  constructor(
    @Inject(RegistrationService) service: RegistrationService,
    @Optional()
    @Inject(LoginAbuseProtection)
    loginAbuseProtection = new LoginAbuseProtection(),
  ) {
    this.service = service;
    this.loginAbuseProtection = loginAbuseProtection;
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
    const pending = await this.service.register(
      readCookie(request, INTENT_COOKIE),
      body,
    );
    response.clearCookie(INTENT_COOKIE, privateCookieOptions());
    return pending;
  }

  @Post("registrations/resend-verification")
  async resendVerification(@Body() body: unknown) {
    return this.service.resendVerification(body);
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
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    if (!refreshToken) {
      response.status(204);
      return;
    }
    const session = await this.service.refresh(refreshToken);
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
    @Req() request?: Request,
  ) {
    const clientAddress =
      request?.ip ?? request?.socket.remoteAddress ?? "unknown";
    let session: Awaited<ReturnType<RegistrationService["login"]>>;
    try {
      session = await this.service.login(body);
      this.loginAbuseProtection.recordLoginSuccess(clientAddress);
    } catch (error) {
      this.loginAbuseProtection.recordLoginFailure(clientAddress);
      throw error;
    }
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

  @Post("account/privacy/rankings")
  @UseGuards(AccessTokenGuard)
  async setPublicRankingsOptIn(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    if (!hasOnlyKeys(body, ["enabled"]))
      throw new RegistrationError(
        400,
        "INVALID_RANKING_PREFERENCE",
        "La preferencia del ranking no es válida.",
      );
    const enabled = isRecord(body) ? body.enabled : undefined;
    return this.service.setPublicRankingsOptIn(requireUserId(request), enabled);
  }

  @Post("account/subscriptions/purchase")
  @UseGuards(AccessTokenGuard)
  async purchasePlan(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: unknown,
  ) {
    if (!hasOnlyKeys(body, ["plan"]))
      throw new RegistrationError(
        400,
        "INVALID_PLAN",
        "Selecciona un plan válido.",
      );
    const plan = isRecord(body) ? body.plan : undefined;
    return this.service.purchasePlanForUser(
      requireUserId(request),
      plan,
      idempotencyKey,
    );
  }
}

function sessionCookieOptions(session: {
  rememberMe: boolean;
  expiresAt: Date;
}) {
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
