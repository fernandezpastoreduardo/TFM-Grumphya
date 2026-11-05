import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createSecurityMiddleware } from "./security.middleware";
import { LoginAbuseProtection } from "./login-abuse-protection.service";

const EVALUATION_PATH = "/api/evaluation-process";
const LOGIN_PATH = "/api/auth/login";
const REQUEST_IP = "192.0.2.10";
const LOGIN_RATE_PER_SECOND = 10;

function createRequest(
  path = EVALUATION_PATH,
  method = "POST",
  ip = REQUEST_IP,
): Request {
  return {
    ip,
    path,
    method,
    socket: { remoteAddress: ip },
    headers: {},
    get: (name: string) =>
      name.toLowerCase() === "origin" ? "http://127.0.0.1:5173" : undefined,
    is: (type: string) => type === "application/json",
  } as unknown as Request;
}

function createResponse() {
  const headers = new Map<string, string>();
  const response = {
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name, value);
      return response;
    }),
    status: vi.fn(() => response),
    json: vi.fn(() => response),
  };
  return { response: response as unknown as Response, headers };
}

describe("security middleware", () => {
  it("adds defensive headers and allows requests below the evaluation limit", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest();
    const { response, headers } = createResponse();
    const next = vi.fn() as NextFunction;

    middleware(request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(self), geolocation=(), on-device-speech-recognition=(self)",
    );
  });

  it("disables HTTP caching for private account responses", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/account/profile", "GET");
    const { response, headers } = createResponse();

    middleware(request, response, vi.fn() as NextFunction);

    expect(headers.get("Cache-Control")).toBe("no-store");
  });

  it("disables caching for private admin dashboard data", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/admin/contact-messages", "GET");
    const { response, headers } = createResponse();
    middleware(request, response, vi.fn() as NextFunction);
    expect(headers.get("Cache-Control")).toBe("no-store");
  });

  it("disables caching for private admin error details", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/admin/application-errors/123", "GET");
    const { response, headers } = createResponse();

    middleware(request, response, vi.fn() as NextFunction);

    expect(headers.get("Cache-Control")).toBe("no-store");
  });

  it("limits evaluation requests by client IP and returns a retry hint", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const request = createRequest();

    for (let index = 0; index < 10; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 429 }),
    );
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(10);
  });

  it("blocks the sixth login request from the same IP in its one-minute window", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const request = createRequest(LOGIN_PATH, "POST");

    for (let index = 0; index < 5; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(5);
  });

  it("does not let rate-limited requests from one IP activate the global challenge threshold", () => {
    vi.useFakeTimers();
    try {
      const loginAbuseProtection = new LoginAbuseProtection({
        secret: "test-secret",
      });
      const recordLoginRequest = vi.spyOn(
        loginAbuseProtection,
        "recordLoginRequest",
      );
      const middleware = createSecurityMiddleware({ loginAbuseProtection });
      const next = vi.fn() as NextFunction;

      for (let second = 0; second < 3; second += 1) {
        vi.setSystemTime(second * 1_000);
        for (let attempt = 0; attempt < LOGIN_RATE_PER_SECOND; attempt += 1) {
          middleware(
            createRequest(LOGIN_PATH, "POST"),
            createResponse().response,
            next,
          );
        }
      }

      expect(next).toHaveBeenCalledTimes(5);
      expect(recordLoginRequest).toHaveBeenCalledTimes(5);
      expect(loginAbuseProtection.isChallengeModeActive(2_999)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires a web challenge after sustained global login traffic across IPs", () => {
    vi.useFakeTimers();
    const loginAbuseProtection = new LoginAbuseProtection({
      secret: "test-secret",
    });
    const middleware = createSecurityMiddleware({ loginAbuseProtection });
    const next = vi.fn() as NextFunction;

    for (let second = 0; second < 3; second += 1) {
      vi.setSystemTime(second * 1_000);
      for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
        middleware(
          createRequest(
            LOGIN_PATH,
            "POST",
            `192.0.2.${second * 10 + requestNumber + 1}`,
          ),
          createResponse().response,
          next,
        );
      }
    }

    const challenged = createResponse();
    middleware(createRequest(LOGIN_PATH), challenged.response, next);

    expect(challenged.response.status).toHaveBeenCalledWith(428);
    expect(challenged.response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "LOGIN_CHALLENGE_REQUIRED" }),
    );
    expect(next).toHaveBeenCalledTimes(29);
    vi.useRealTimers();
  });

  it("blocks an IP after four failed logins during challenge mode", () => {
    vi.useFakeTimers();
    vi.setSystemTime(3_003);
    const loginAbuseProtection = new LoginAbuseProtection({
      secret: "test-secret",
    });
    for (let second = 0; second < 3; second += 1) {
      for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
        loginAbuseProtection.recordLoginRequest(second * 1_000);
      }
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      loginAbuseProtection.recordLoginFailure(REQUEST_IP, 3_000 + attempt);
    }
    const middleware = createSecurityMiddleware({ loginAbuseProtection });
    const { response, headers } = createResponse();

    middleware(createRequest(LOGIN_PATH), response, vi.fn() as NextFunction);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.get("Retry-After")).toBe("900");
    expect(loginAbuseProtection.getAdminSnapshot(3_003)).toMatchObject({
      blockedRequests: 1,
      activeBlockedAddresses: 1,
    });
    vi.useRealTimers();
  });

  it("limits public CSP report ingestion to protect application logs", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/csp-reports", "POST");
    const next = vi.fn() as NextFunction;

    for (let index = 0; index < 20; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const limited = createResponse();

    middleware(request, limited.response, next);

    expect(limited.response.status).toHaveBeenCalledWith(429);
    expect(limited.headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(20);
  });

  it("applies a configured API request limit", () => {
    const middleware = createSecurityMiddleware({ apiRequestLimit: 1 });
    const request = createRequest();
    const next = vi.fn() as NextFunction;

    middleware(request, createResponse().response, next);
    const { response, headers } = createResponse();
    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledOnce();
  });

  it("limits public worst-ideas ranking reads by client IP", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/worst-ideas", "GET");
    const next = vi.fn() as NextFunction;

    for (let index = 0; index < 30; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(30);
  });

  it("applies the public ranking read limit to the all-time endpoint", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/worst-ideas/all-time", "GET");
    const next = vi.fn() as NextFunction;

    for (let index = 0; index < 30; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(30);
  });

  it("limits private worst-ideas history reads by client IP", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/account/worst-ideas", "GET");
    const next = vi.fn() as NextFunction;

    for (let index = 0; index < 30; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(30);
  });

  it("limits public roast-ranking reads by client IP", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/roast-ranking", "GET");
    const next = vi.fn() as NextFunction;

    for (let index = 0; index < 30; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(30);
  });

  it("limits public best-users reads by client IP", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/best-users", "GET");
    const next = vi.fn() as NextFunction;

    for (let index = 0; index < 30; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(30);
  });

  it("keeps the dedicated best-users limit when the route has a trailing slash", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/best-users/", "GET");
    const next = vi.fn() as NextFunction;

    for (let index = 0; index < 30; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(30);
  });

  it("rejects registration requests without the configured origin", () => {
    const middleware = createSecurityMiddleware();
    const request = {
      ...createRequest("/api/registrations"),
      get: () => "https://attacker.example",
    } as unknown as Request;
    const { response } = createResponse();
    const next = vi.fn() as NextFunction;

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requires JSON for registration requests", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/registrations");
    request.is = () => false;
    const { response } = createResponse();
    const next = vi.fn() as NextFunction;

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(415);
    expect(next).not.toHaveBeenCalled();
  });

  it("protects anonymous profile issuance and roast submissions with origin and JSON checks", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const foreignOriginRequest = {
      ...createRequest("/api/anonymous-usage"),
      get: () => "https://attacker.example",
    } as unknown as Request;
    const foreignResponse = createResponse();
    middleware(foreignOriginRequest, foreignResponse.response, next);
    expect(foreignResponse.response.status).toHaveBeenCalledWith(403);

    const wrongContentTypeRequest = createRequest("/api/roast");
    wrongContentTypeRequest.is = () => false;
    const contentResponse = createResponse();
    middleware(wrongContentTypeRequest, contentResponse.response, next);
    expect(contentResponse.response.status).toHaveBeenCalledWith(415);
    expect(next).not.toHaveBeenCalled();
  });

  it("protects contact message submissions with origin and JSON checks", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const foreignOriginRequest = {
      ...createRequest("/api/contact-messages", "POST"),
      get: () => "https://attacker.example",
    } as unknown as Request;
    const foreignResponse = createResponse();
    middleware(foreignOriginRequest, foreignResponse.response, next);
    expect(foreignResponse.response.status).toHaveBeenCalledWith(403);

    const wrongContentTypeRequest = createRequest(
      "/api/contact-messages",
      "POST",
    );
    wrongContentTypeRequest.is = () => false;
    const contentResponse = createResponse();
    middleware(wrongContentTypeRequest, contentResponse.response, next);
    expect(contentResponse.response.status).toHaveBeenCalledWith(415);
    expect(next).not.toHaveBeenCalled();
  });

  it("limits contact message submissions to five per minute per client", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const base = createRequest("/api/contact-messages", "POST");
    const request = {
      ...base,
      get: (name: string) =>
        name.toLowerCase() === "origin" ? "http://127.0.0.1:5173" : undefined,
      is: (type: string) => type === "application/json",
    } as unknown as Request;

    for (let index = 0; index < 5; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(5);
  });

  it("allows only same-origin multipart avatar uploads", () => {
    const middleware = createSecurityMiddleware();
    const base = createRequest("/api/account/avatar", "POST");
    const request = {
      ...base,
      is: (type: string) => type === "multipart/form-data",
    } as unknown as Request;
    const { response } = createResponse();
    const next = vi.fn() as NextFunction;

    middleware(request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("limits avatar uploads to three requests per minute per client", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const base = createRequest("/api/account/avatar", "POST");
    const request = {
      ...base,
      is: (type: string) => type === "multipart/form-data",
    } as unknown as Request;

    for (let index = 0; index < 3; index += 1) {
      middleware(request, createResponse().response, next);
    }
    const { response, headers } = createResponse();

    middleware(request, response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(headers.has("Retry-After")).toBe(true);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("does not count CORS preflight requests", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const request = createRequest("/api/evaluation-process", "OPTIONS");

    middleware(request, createResponse().response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("rate limits registration intent endpoints and rejects URL query parameters", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const request = createRequest("/api/registration-intents", "POST");
    for (let index = 0; index < 20; index += 1)
      middleware(request, createResponse().response, next);
    const limited = createResponse();
    middleware(request, limited.response, next);
    expect(limited.response.status).toHaveBeenCalledWith(429);

    const queryRequest = {
      ...createRequest("/api/registration-intents?plan=ILUMINADO", "POST"),
      originalUrl: "/api/registration-intents?plan=ILUMINADO",
    } as unknown as Request;
    const queryResponse = createResponse();
    middleware(queryRequest, queryResponse.response, next);
    expect(queryResponse.response.status).toHaveBeenCalledWith(400);
  });

  it("rate limits account creation submissions and returns a retry interval", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const request = createRequest("/api/registrations", "POST");
    for (let index = 0; index < 8; index += 1)
      middleware(request, createResponse().response, next);

    const limited = createResponse();
    middleware(request, limited.response, next);

    expect(limited.response.status).toHaveBeenCalledWith(429);
    expect(limited.response.setHeader).toHaveBeenCalledWith(
      "Retry-After",
      expect.any(String),
    );
    expect(next).toHaveBeenCalledTimes(8);
  });

  it("keeps logout available after the refresh limit is reached", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const refreshRequest = createRequest("/api/auth/refresh", "POST");

    for (let index = 0; index < 10; index += 1) {
      middleware(refreshRequest, createResponse().response, next);
    }

    const logoutRequest = createRequest("/api/auth/logout", "POST");
    const { response } = createResponse();
    middleware(logoutRequest, response, next);

    expect(response.status).not.toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(11);
  });

  it("does not apply the session refresh limit when the refresh cookie is absent", () => {
    const middleware = createSecurityMiddleware({
      sessionRefreshRequestLimit: 1,
    });
    const next = vi.fn() as NextFunction;
    const refreshRequest = createRequest("/api/auth/refresh", "POST");

    middleware(refreshRequest, createResponse().response, next);
    const secondResponse = createResponse();
    middleware(refreshRequest, secondResponse.response, next);

    expect(secondResponse.response.status).not.toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("keeps the session refresh limit when the refresh cookie is present", () => {
    const middleware = createSecurityMiddleware({
      sessionRefreshRequestLimit: 1,
    });
    const next = vi.fn() as NextFunction;
    const refreshRequest = {
      ...createRequest("/api/auth/refresh", "POST"),
      headers: { cookie: "grumphya_refresh=session-token" },
    } as unknown as Request;

    middleware(refreshRequest, createResponse().response, next);
    const secondResponse = createResponse();
    middleware(refreshRequest, secondResponse.response, next);

    expect(secondResponse.response.status).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledOnce();
  });
});
