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
  } as Request;
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

  it("does not count CORS preflight requests", () => {
    const middleware = createSecurityMiddleware();
    const next = vi.fn() as NextFunction;
    const request = createRequest("/api/evaluation-process", "OPTIONS");

    middleware(request, createResponse().response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
