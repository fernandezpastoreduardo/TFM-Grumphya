import type { RequestHandler } from "express";

const RATE_LIMIT_WINDOW_MS = 60_000;
const API_REQUEST_LIMIT = 120;
const EVALUATION_REQUEST_LIMIT = 10;
const REGISTRATION_REQUEST_LIMIT = 8;
const REGISTRATION_INTENT_REQUEST_LIMIT = 20;
const REGISTRATION_VERIFY_REQUEST_LIMIT = 10;
const LOGIN_REQUEST_LIMIT = 5;
const SESSION_LOGOUT_REQUEST_LIMIT = 10;
const ACCOUNT_DELETE_REQUEST_LIMIT = 5;
const AVATAR_UPLOAD_REQUEST_LIMIT = 3;
const CONTACT_MESSAGE_REQUEST_LIMIT = 5;
const WORST_IDEAS_READ_REQUEST_LIMIT = 30;
const WORST_IDEAS_USER_READ_REQUEST_LIMIT = 30;
const ROAST_RANKING_READ_REQUEST_LIMIT = 30;
const BEST_USERS_READ_REQUEST_LIMIT = 30;
const ADMIN_READ_REQUEST_LIMIT = 30;
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const CLEANUP_INTERVAL_REQUESTS = 64;
const RATE_LIMIT_MESSAGE = "Demasiadas solicitudes. Inténtalo más tarde.";

type RateLimitBucket = { count: number; resetAt: number };
type SecurityMiddlewareOptions = { sessionRefreshRequestLimit?: number };

function setSecurityHeaders(response: Parameters<RequestHandler>[1]): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), on-device-speech-recognition=(self)",
  );
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
}

export function createSecurityMiddleware(
  options: SecurityMiddlewareOptions = {},
): RequestHandler {
  const sessionRefreshRequestLimit =
    Number.isSafeInteger(options.sessionRefreshRequestLimit) &&
    Number(options.sessionRefreshRequestLimit) > 0
      ? Number(options.sessionRefreshRequestLimit)
      : REGISTRATION_VERIFY_REQUEST_LIMIT;
  const buckets = new Map<string, RateLimitBucket>();
  let requestCount = 0;

  return (request, response, next) => {
    setSecurityHeaders(response);
    if (
      request.path === "/api/account" ||
      request.path.startsWith("/api/account/") ||
      request.path === "/api/auth" ||
      request.path.startsWith("/api/auth/") ||
      request.path.startsWith("/api/registration") ||
      request.path === "/api/contact-messages" ||
      request.path === "/api/admin/dashboard" ||
      request.path === "/api/admin/contact-messages" ||
      request.path.startsWith("/api/dev/mail-preview")
    ) {
      response.setHeader("Cache-Control", "no-store");
    }
    if (request.method === "OPTIONS") {
      next();
      return;
    }

    const isProtectedCookieMutation =
      (request.method === "POST" ||
        (request.method === "DELETE" && request.path === "/api/account")) &&
      (request.path.startsWith("/api/registration") ||
        request.path.startsWith("/api/account/") ||
        request.path === "/api/account" ||
        request.path.startsWith("/api/auth/") ||
        request.path === "/api/anonymous-usage" ||
        request.path === "/api/evaluation-process" ||
        request.path === "/api/roast" ||
        request.path === "/api/contact-messages");
    if (isProtectedCookieMutation) {
      const allowedOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173";
      if (request.get("origin") !== allowedOrigin) {
        response.status(403).json({
          statusCode: 403,
          message: "Origen de solicitud no permitido.",
        });
        return;
      }
      if (
        !request.is("application/json") &&
        !(isAvatarUploadRequest(request) && request.is("multipart/form-data"))
      ) {
        response
          .status(415)
          .json({ statusCode: 415, message: "Se requiere application/json." });
        return;
      }
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
    const normalizedPath = request.path.replace(/\/+$/, "") || "/";
    if (
      request.path.startsWith("/api/registration") &&
      request.originalUrl?.includes("?")
    ) {
      response.status(400).json({
        statusCode: 400,
        message: "La URL no admite parámetros para esta solicitud.",
      });
      return;
    }
    const isEvaluation =
      request.method === "POST" &&
      (request.path === "/api/evaluation-process" ||
        request.path === "/api/roast");
    const isWorstIdeasRead =
      request.method === "GET" && request.path === "/api/worst-ideas";
    const isWorstIdeasUserRead =
      request.method === "GET" && request.path === "/api/account/worst-ideas";
    const isRoastRankingRead =
      request.method === "GET" && request.path === "/api/roast-ranking";
    const isBestUsersRead =
      request.method === "GET" && normalizedPath === "/api/best-users";
    const isAdminRead =
      request.method === "GET" && request.path.startsWith("/api/admin/");
    const isRegistrationPost =
      request.method === "POST" && request.path.startsWith("/api/registration");
    const isRefreshPost =
      request.method === "POST" && request.path === "/api/auth/refresh";
    const isLoginPost =
      request.method === "POST" && request.path === "/api/auth/login";
    const isLogoutPost =
      request.method === "POST" && request.path === "/api/auth/logout";
    const isAuthPost =
      request.method === "POST" && request.path.startsWith("/api/auth/");
    const isAccountPost =
      request.method === "POST" && request.path.startsWith("/api/account/");
    const isAvatarUpload = isAvatarUploadRequest(request);
    const isAccountDelete =
      request.method === "DELETE" && request.path === "/api/account";
    const isContactMessagePost =
      request.method === "POST" && request.path === "/api/contact-messages";
    const registrationScope = isContactMessagePost
      ? "contact-message"
      : isAccountDelete
        ? "account-delete"
        : isAvatarUpload
          ? "account-avatar-upload"
          : isLoginPost
            ? "session-login"
            : isLogoutPost
              ? "session-logout"
              : isAuthPost
                ? "session-refresh"
                : request.path.includes("verify") ||
                    request.path.includes("confirm")
                  ? "registration-verification"
                  : request.path.includes("intents")
                    ? "registration-intent"
                    : "registration-create";
    const registrationLimit =
      registrationScope === "session-login"
        ? LOGIN_REQUEST_LIMIT
        : registrationScope === "session-logout"
          ? SESSION_LOGOUT_REQUEST_LIMIT
          : registrationScope === "account-delete"
            ? ACCOUNT_DELETE_REQUEST_LIMIT
            : registrationScope === "account-avatar-upload"
              ? AVATAR_UPLOAD_REQUEST_LIMIT
              : registrationScope === "contact-message"
                ? CONTACT_MESSAGE_REQUEST_LIMIT
                : registrationScope === "registration-intent"
                  ? REGISTRATION_INTENT_REQUEST_LIMIT
                  : registrationScope === "session-refresh"
                    ? sessionRefreshRequestLimit
                    : registrationScope === "registration-verification" ||
                        isRefreshPost
                      ? REGISTRATION_VERIFY_REQUEST_LIMIT
                      : REGISTRATION_REQUEST_LIMIT;
    const limits: ReadonlyArray<readonly [string, number]> = isAdminRead
      ? [
          ["api", API_REQUEST_LIMIT],
          ["admin-read", ADMIN_READ_REQUEST_LIMIT],
        ]
      : isEvaluation
        ? [
            ["api", API_REQUEST_LIMIT],
            ["evaluation", EVALUATION_REQUEST_LIMIT],
          ]
        : isWorstIdeasRead
          ? [
              ["api", API_REQUEST_LIMIT],
              ["worst-ideas-read", WORST_IDEAS_READ_REQUEST_LIMIT],
            ]
          : isWorstIdeasUserRead
            ? [
                ["api", API_REQUEST_LIMIT],
                ["worst-ideas-user-read", WORST_IDEAS_USER_READ_REQUEST_LIMIT],
              ]
            : isRoastRankingRead
              ? [
                  ["api", API_REQUEST_LIMIT],
                  ["roast-ranking-read", ROAST_RANKING_READ_REQUEST_LIMIT],
                ]
              : isBestUsersRead
                ? [
                    ["api", API_REQUEST_LIMIT],
                    ["best-users-read", BEST_USERS_READ_REQUEST_LIMIT],
                  ]
                : isRegistrationPost ||
                    isAuthPost ||
                    isAccountPost ||
                    isAccountDelete ||
                    isContactMessagePost
                  ? [
                      ["api", API_REQUEST_LIMIT],
                      [registrationScope, registrationLimit],
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

function isAvatarUploadRequest(
  request: Parameters<RequestHandler>[0],
): boolean {
  return request.method === "POST" && request.path === "/api/account/avatar";
}
