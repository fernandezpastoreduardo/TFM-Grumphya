import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { RegistrationController } from "./registration.controller";
import { RegistrationError } from "./registration.models";
import { RegistrationService } from "./registration.service";
import { LoginAbuseProtection } from "../security/login-abuse-protection.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const RESEND_BODY = { email: "persona@example.es" };
const RANKING_BODY = { enabled: true };
const PLAN_BODY = { plan: "FALTON" };
const REGISTRATION_INTENT_COOKIE = "grumphya_registration_intent";
const VERIFIED_REGISTRATION_COOKIE = "grumphya_verified_registration";
const REFRESH_COOKIE = "grumphya_refresh";
const REFRESH_TOKEN = "refresh-token";
const ACCESS_TOKEN = "access-token";
const ACCOUNT_RESULT = { account: { user: { id: USER_ID } } };
const SESSION = {
  refreshToken: REFRESH_TOKEN,
  rememberMe: false,
  expiresAt: new Date("2026-10-28T00:00:00.000Z"),
  result: ACCOUNT_RESULT,
};

function createController(loginAbuseProtection = createLoginAbuseProtection()) {
  const service = {
    createIntent: vi.fn().mockResolvedValue({
      token: "intent-token",
      expiresAt: new Date("2026-10-28T00:00:00.000Z"),
    }),
    currentIntent: vi.fn().mockResolvedValue(null),
    register: vi.fn().mockResolvedValue({ status: "verification_pending" }),
    resendVerification: vi.fn().mockResolvedValue({ status: "sent" }),
    verify: vi.fn().mockResolvedValue({
      confirmationToken: "confirmation-token",
      result: { status: "verified" },
    }),
    confirm: vi.fn().mockResolvedValue(SESSION),
    refresh: vi.fn().mockResolvedValue({
      ...SESSION,
      refreshToken: "rotated-refresh-token",
      result: { accessToken: ACCESS_TOKEN },
    }),
    login: vi.fn().mockResolvedValue(SESSION),
    logout: vi.fn().mockResolvedValue(undefined),
    getUserProfile: vi.fn().mockResolvedValue({ id: USER_ID }),
    getUserGoodIdeas: vi.fn().mockResolvedValue([]),
    setPublicRankingsOptIn: vi
      .fn()
      .mockResolvedValue({ publicRankingsOptIn: true }),
    purchasePlanForUser: vi.fn(),
  } as unknown as RegistrationService;
  return {
    controller: new RegistrationController(service, loginAbuseProtection),
    service,
    loginAbuseProtection,
  };
}

function createLoginAbuseProtection() {
  return {
    recordLoginFailure: vi.fn(),
    recordLoginSuccess: vi.fn(),
  } as unknown as LoginAbuseProtection;
}

function createResponse() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    status: vi.fn(),
  };
}

describe("RegistrationController", () => {
  it("rejects malformed plan intent payloads before creating an intent", async () => {
    const { controller, service } = createController();
    const response = createResponse();

    await expect(
      controller.createIntent(null, response as never),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_PLAN" },
    });
    expect(service.createIntent).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("creates an intent, sets its private cookie, and returns its expiry", async () => {
    const { controller, service } = createController();
    const response = createResponse();

    await expect(
      controller.createIntent(PLAN_BODY, response as never),
    ).resolves.toEqual({
      expiresAt: "2026-10-28T00:00:00.000Z",
    });

    expect(service.createIntent).toHaveBeenCalledWith(PLAN_BODY.plan);
    expect(response.cookie).toHaveBeenCalledWith(
      REGISTRATION_INTENT_COOKIE,
      "intent-token",
      expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
    );
  });

  it("returns the missing-intent error when no plan is pending", async () => {
    const { controller, service } = createController();

    await expect(
      controller.currentIntent({ headers: {} } as never),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: "REGISTRATION_INTENT_NOT_FOUND" },
    });
    expect(service.currentIntent).toHaveBeenCalledWith(undefined);
  });

  it("returns the pending plan from the intent cookie", async () => {
    const { controller, service } = createController();
    vi.mocked(service.currentIntent).mockResolvedValueOnce("FALTON" as never);

    await expect(
      controller.currentIntent({
        headers: { cookie: `${REGISTRATION_INTENT_COOKIE}=encoded%20intent` },
      } as never),
    ).resolves.toEqual({ plan: "FALTON" });

    expect(service.currentIntent).toHaveBeenCalledWith("encoded intent");
  });

  it("registers with the intent cookie and clears it only after success", async () => {
    const { controller, service } = createController();
    const response = createResponse();
    const body = { email: "persona@example.es" };

    await expect(
      controller.register(
        {
          headers: { cookie: `${REGISTRATION_INTENT_COOKIE}=intent-token` },
        } as never,
        body,
        response as never,
      ),
    ).resolves.toEqual({ status: "verification_pending" });

    expect(service.register).toHaveBeenCalledWith("intent-token", body);
    expect(response.clearCookie).toHaveBeenCalledWith(
      REGISTRATION_INTENT_COOKIE,
      expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
    );
  });

  it("forwards verification resend requests to the service", async () => {
    const { controller, service } = createController();

    await expect(controller.resendVerification(RESEND_BODY)).resolves.toEqual({
      status: "sent",
    });
    expect(service.resendVerification).toHaveBeenCalledOnce();
    expect(service.resendVerification).toHaveBeenCalledWith(RESEND_BODY);
  });

  it("uses the authenticated user when updating ranking preferences", async () => {
    const { controller, service } = createController();

    await expect(
      controller.setPublicRankingsOptIn(
        { user: { userId: USER_ID } } as never,
        RANKING_BODY,
      ),
    ).resolves.toEqual({ publicRankingsOptIn: true });
    expect(service.setPublicRankingsOptIn).toHaveBeenCalledWith(
      USER_ID,
      RANKING_BODY.enabled,
    );
  });

  it("rejects invalid ranking preference shapes before calling the service", async () => {
    const { controller, service } = createController();

    await expect(
      controller.setPublicRankingsOptIn(
        { user: { userId: USER_ID } } as never,
        { ...RANKING_BODY, userId: "attacker-controlled" },
      ),
    ).rejects.toBeInstanceOf(RegistrationError);
    expect(service.setPublicRankingsOptIn).not.toHaveBeenCalled();
  });

  it("requires an authenticated identity for ranking preferences", async () => {
    const { controller, service } = createController();

    await expect(
      controller.setPublicRankingsOptIn({} as never, RANKING_BODY),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.setPublicRankingsOptIn).not.toHaveBeenCalled();
  });

  it("rejects malformed verification payloads before consuming a token", async () => {
    const { controller } = createController();
    const response = createResponse();

    await expect(
      controller.verify({ token: 123 }, response as never),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: "INVALID_VERIFICATION",
        message: "El enlace no es válido o ha caducado.",
      },
    });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("rejects verification payloads with unexpected keys", async () => {
    const { controller } = createController();
    const response = createResponse();

    await expect(
      controller.verify(
        { token: "valid-looking-token", extra: "untrusted" },
        response as never,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_VERIFICATION" },
    });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("verifies a token, stores the confirmation cookie, and returns the result", async () => {
    const { controller, service } = createController();
    const response = createResponse();

    await expect(
      controller.verify({ token: "verification-token" }, response as never),
    ).resolves.toEqual({ status: "verified" });

    expect(service.verify).toHaveBeenCalledWith("verification-token");
    expect(response.cookie).toHaveBeenCalledWith(
      VERIFIED_REGISTRATION_COOKIE,
      "confirmation-token",
      expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
    );
  });

  it("confirms a registration using its cookie and creates a session cookie", async () => {
    const { controller, service } = createController();
    const response = createResponse();

    await expect(
      controller.confirm(
        {
          headers: { cookie: `${VERIFIED_REGISTRATION_COOKIE}=confirm-token` },
        } as never,
        response as never,
      ),
    ).resolves.toEqual(ACCOUNT_RESULT);

    expect(service.confirm).toHaveBeenCalledWith("confirm-token");
    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      REFRESH_TOKEN,
      expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      VERIFIED_REGISTRATION_COOKIE,
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("does not call refresh or set a cookie when no refresh token is present", async () => {
    const { controller, service } = createController();
    const response = createResponse();

    await expect(
      controller.refresh({ headers: {} } as never, response as never),
    ).resolves.toBeUndefined();

    expect(response.status).toHaveBeenCalledWith(204);
    expect(service.refresh).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("rotates an existing refresh token", async () => {
    const { controller, service } = createController();
    const response = createResponse();

    await expect(
      controller.refresh(
        { headers: { cookie: `${REFRESH_COOKIE}=${REFRESH_TOKEN}` } } as never,
        response as never,
      ),
    ).resolves.toEqual({ accessToken: ACCESS_TOKEN });

    expect(service.refresh).toHaveBeenCalledWith(REFRESH_TOKEN);
    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      "rotated-refresh-token",
      expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
    );
  });

  it("logs in and sets a refresh cookie without remember-me lifetime", async () => {
    const { controller, service, loginAbuseProtection } = createController();
    const response = createResponse();
    const body = { email: "persona@example.es", password: "secret" };

    await expect(controller.login(body, response as never)).resolves.toEqual(
      ACCOUNT_RESULT,
    );

    expect(service.login).toHaveBeenCalledWith(body);
    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      REFRESH_TOKEN,
      expect.not.objectContaining({ maxAge: expect.any(Number) }),
    );
    expect(loginAbuseProtection.recordLoginSuccess).toHaveBeenCalledWith(
      "unknown",
    );
  });

  it("records a failed login against the request IP without exposing the error", async () => {
    const { controller, service, loginAbuseProtection } = createController();
    const response = createResponse();
    const request = { ip: "192.0.2.25", socket: { remoteAddress: "local" } };
    vi.mocked(service.login).mockRejectedValueOnce(
      new RegistrationError(
        401,
        "LOGIN_UNAVAILABLE",
        "Credenciales no válidas.",
      ),
    );

    await expect(
      controller.login({}, response as never, request as never),
    ).rejects.toMatchObject({ status: 401, code: "LOGIN_UNAVAILABLE" });

    expect(loginAbuseProtection.recordLoginFailure).toHaveBeenCalledWith(
      request.ip,
    );
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("does not count infrastructure errors as failed credential attempts", async () => {
    const { controller, service, loginAbuseProtection } = createController();
    const response = createResponse();
    const infrastructureError = new Error("Database connection unavailable.");
    vi.mocked(service.login).mockRejectedValueOnce(infrastructureError);

    await expect(
      controller.login(
        { identifier: "persona", password: "secret", rememberMe: false },
        response as never,
      ),
    ).rejects.toBe(infrastructureError);

    expect(loginAbuseProtection.recordLoginFailure).not.toHaveBeenCalled();
    expect(loginAbuseProtection.recordLoginSuccess).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it("sets the remaining session lifetime when remember-me is enabled", async () => {
    const { controller, service } = createController();
    const response = createResponse();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    vi.mocked(service.login).mockResolvedValueOnce({
      ...SESSION,
      rememberMe: true,
      expiresAt,
    } as never);

    await controller.login({}, response as never);

    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      REFRESH_TOKEN,
      expect.objectContaining({ maxAge: expect.any(Number) }),
    );
    const cookieOptions = vi.mocked(response.cookie).mock.calls[0]?.[2];
    expect(cookieOptions?.maxAge).toBeGreaterThan(0);
    expect(cookieOptions?.maxAge).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it("expires an already-expired remember-me refresh cookie immediately", async () => {
    const { controller, service } = createController();
    const response = createResponse();
    vi.mocked(service.login).mockResolvedValueOnce({
      ...SESSION,
      rememberMe: true,
      expiresAt: new Date(Date.now() - 60_000),
    } as never);

    await controller.login({}, response as never);

    const cookieOptions = vi.mocked(response.cookie).mock.calls[0]?.[2];
    expect(cookieOptions?.maxAge).toBe(0);
  });

  it("logs out and clears the refresh cookie after revoking the session", async () => {
    const { controller, service } = createController();
    const response = createResponse();

    await expect(
      controller.logout(
        { headers: { cookie: `${REFRESH_COOKIE}=${REFRESH_TOKEN}` } } as never,
        response as never,
      ),
    ).resolves.toEqual({ status: "signed_out" });

    expect(service.logout).toHaveBeenCalledWith(REFRESH_TOKEN);
    expect(response.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      expect.objectContaining({ httpOnly: true, sameSite: "strict" }),
    );
  });

  it("returns the authenticated account profile", async () => {
    const { controller, service } = createController();

    await expect(
      controller.accountProfile({ user: { userId: USER_ID } } as never),
    ).resolves.toEqual({ id: USER_ID });

    expect(service.getUserProfile).toHaveBeenCalledWith(USER_ID);
  });

  it("requires an authenticated identity to read the profile", async () => {
    const { controller, service } = createController();

    await expect(controller.accountProfile({} as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.getUserProfile).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's good ideas", async () => {
    const { controller, service } = createController();

    await expect(
      controller.goodIdeas({ user: { userId: USER_ID } } as never),
    ).resolves.toEqual([]);

    expect(service.getUserGoodIdeas).toHaveBeenCalledWith(USER_ID);
  });

  it("requires an authenticated identity to read good ideas", async () => {
    const { controller, service } = createController();

    await expect(controller.goodIdeas({} as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.getUserGoodIdeas).not.toHaveBeenCalled();
  });

  it("rejects malformed purchase payloads before changing a plan", async () => {
    const { controller, service } = createController();

    await expect(
      controller.purchasePlan(
        { user: { userId: USER_ID } } as never,
        null,
        "10000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "INVALID_PLAN" },
    });
    expect(service.purchasePlanForUser).not.toHaveBeenCalled();
  });

  it("purchases a plan for the authenticated user with its idempotency key", async () => {
    const { controller, service } = createController();
    const purchase = { subscription: { plan: "FALTON" } };
    vi.mocked(service.purchasePlanForUser).mockResolvedValueOnce(
      purchase as never,
    );
    const idempotencyKey = "10000000-0000-4000-8000-000000000001";

    await expect(
      controller.purchasePlan(
        { user: { userId: USER_ID } } as never,
        PLAN_BODY,
        idempotencyKey,
      ),
    ).resolves.toEqual(purchase);

    expect(service.purchasePlanForUser).toHaveBeenCalledWith(
      USER_ID,
      PLAN_BODY.plan,
      idempotencyKey,
    );
  });

  it("requires authentication before purchasing a valid plan", async () => {
    const { controller, service } = createController();

    await expect(
      controller.purchasePlan({} as never, PLAN_BODY, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.purchasePlanForUser).not.toHaveBeenCalled();
  });
});
