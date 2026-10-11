import type { RequestHandler } from "express";

const RATE_LIMIT_WINDOW_MS = 60_000;
const API_REQUEST_LIMIT = 120;
const EVALUATION_REQUEST_LIMIT = 10;
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const CLEANUP_INTERVAL_REQUESTS = 64;
const RATE_LIMIT_MESSAGE = "Demasiadas solicitudes. Inténtalo más tarde.";

type RateLimitBucket = { count: number; resetAt: number };

function setSecurityHeaders(response: Parameters<RequestHandler>[1]): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
}

export function createSecurityMiddleware(): RequestHandler {
  const buckets = new Map<string, RateLimitBucket>();
  let requestCount = 0;

  return (request, response, next) => {
    setSecurityHeaders(response);
    if (request.method === "OPTIONS") {
      next();
      return;
    }

    const now = Date.now();
    requestCount += 1;
    if (requestCount % CLEANUP_INTERVAL_REQUESTS === 0) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const clientAddress =
      request.ip ?? request.socket.remoteAddress ?? "unknown";
    const isEvaluation =
      request.method === "POST" && request.path === "/api/evaluation-process";
    const limits: ReadonlyArray<readonly [string, number]> = isEvaluation
      ? [
          ["api", API_REQUEST_LIMIT],
          ["evaluation", EVALUATION_REQUEST_LIMIT],
        ]
      : [["api", API_REQUEST_LIMIT]];

    for (const [scope, limit] of limits) {
      const key = `${clientAddress}:${scope}`;
      const current = buckets.get(key);
      const bucket =
        !current || current.resetAt <= now
          ? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
          : current;
      if (bucket.count >= limit) {
        response.setHeader(
          "Retry-After",
          String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))),
        );
        response.status(429).json({
          statusCode: 429,
          message: RATE_LIMIT_MESSAGE,
        });
        return;
      }
      bucket.count += 1;
      if (!buckets.has(key) && buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey) buckets.delete(oldestKey);
      }
      buckets.set(key, bucket);
    }

    next();
  };
}
