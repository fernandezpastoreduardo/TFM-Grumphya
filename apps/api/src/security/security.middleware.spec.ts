import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createSecurityMiddleware } from "./security.middleware";

const EVALUATION_PATH = "/api/evaluation-process";
const REQUEST_IP = "192.0.2.10";

function createRequest(path = EVALUATION_PATH, method = "POST"): Request {
  return {
    ip: REQUEST_IP,
    path,
    method,
    socket: { remoteAddress: REQUEST_IP },
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
  });

  it("disables HTTP caching for private account responses", () => {
    const middleware = createSecurityMiddleware();
    const request = createRequest("/api/account/profile", "GET");
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
});
