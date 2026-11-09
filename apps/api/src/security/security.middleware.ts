import type { RequestHandler } from "express";
import { readCookie } from "../infrastructure/http/read-cookie";
import { LoginAbuseProtection } from "./login-abuse-protection.service";

const RATE_LIMIT_WINDOW_MS = 60_000;
const API_REQUEST_LIMIT = 120;
const CSP_REPORT_REQUEST_LIMIT = 20;
const EVALUATION_REQUEST_LIMIT = 10;
const REGISTRATION_REQUEST_LIMIT = 8;
const REGISTRATION_INTENT_REQUEST_LIMIT = 20;
const REGISTRATION_VERIFY_REQUEST_LIMIT = 10;
const REFRESH_COOKIE = "grumphya_refresh";
const LOGIN_REQUEST_LIMIT = 5;
const PASSWORD_RESET_REQUEST_LIMIT = 5;
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
type SecurityMiddlewareOptions = {
  apiRequestLimit?: number;
  sessionRefreshRequestLimit?: number;
  loginAbuseProtection?: LoginAbuseProtection;
};

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

type SecurityRequest = Parameters<RequestHandler>[0];
type SecurityResponse = Parameters<RequestHandler>[1];
type ScopedLimit = [string, number];

function shouldDisableCaching(path: string): boolean {
  return (
    path === "/api/account" ||
    path.startsWith("/api/account/") ||
    path === "/api/auth" ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/registration") ||
    path === "/api/contact-messages" ||
    path.startsWith("/api/admin/") ||
    path.startsWith("/api/internal/lighthouse-quality/") ||
    path.startsWith("/api/dev/mail-preview")
  );
}

function isProtectedCookieMutation(request: SecurityRequest): boolean {
  if (
    request.method !== "POST" &&
    !(request.method === "DELETE" && request.path === "/api/account")
  ) {
    return false;
  }
  return (
    request.path.startsWith("/api/registration") ||
    request.path.startsWith("/api/account/") ||
    request.path === "/api/account" ||
    request.path.startsWith("/api/auth/") ||
    request.path === "/api/anonymous-usage" ||
    request.path === "/api/evaluation-process" ||
    request.path === "/api/roast" ||
    request.path === "/api/contact-messages"
  );
}

function rejectInvalidMutation(
  request: SecurityRequest,
  response: SecurityResponse,
): boolean {
  if (!isProtectedCookieMutation(request)) return false;
  const allowedOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173";
  if (request.get("origin") !== allowedOrigin) {
    response.status(403).json({
      statusCode: 403,
      message: "Origen de solicitud no permitido.",
    });
    return true;
  }
  if (
    !request.is("application/json") &&
    !(isAvatarUploadRequest(request) && request.is("multipart/form-data"))
  ) {
    response
      .status(415)
      .json({ statusCode: 415, message: "Se requiere application/json." });
    return true;
  }
  return false;
}

function isLoginRequest(request: SecurityRequest): boolean {
  return request.method === "POST" && request.path === "/api/auth/login";
}

function rejectBlockedLogin(
  request: SecurityRequest,
  response: SecurityResponse,
  protection: LoginAbuseProtection,
  clientAddress: string,
  now: number,
): boolean {
  if (!isLoginRequest(request)) return false;
  const blockedSeconds = protection.getBlockedRetryAfter(clientAddress, now);
  if (blockedSeconds <= 0) return false;
  protection.recordBlockedLoginRequest(now);
  response.setHeader("Retry-After", String(blockedSeconds));
  response.status(429).json({
    statusCode: 429,
    code: "LOGIN_IP_BLOCKED",
    message: RATE_LIMIT_MESSAGE,
  });
  return true;
}

function evaluationLimit(request: SecurityRequest): ScopedLimit | undefined {
  const { method, path } = request;
  if (method === "POST" && path === "/api/csp-reports") {
    return ["csp-report", CSP_REPORT_REQUEST_LIMIT];
  }
  if (method === "GET" && path.startsWith("/api/admin/")) {
    return ["admin-read", ADMIN_READ_REQUEST_LIMIT];
  }
  if (
    method === "POST" &&
    (path === "/api/evaluation-process" || path === "/api/roast")
  ) {
    return ["evaluation", EVALUATION_REQUEST_LIMIT];
  }
  return undefined;
}

function readLimit(request: SecurityRequest): ScopedLimit | undefined {
  const { method, path } = request;
  if (
    method === "GET" &&
    (path === "/api/worst-ideas" || path === "/api/worst-ideas/all-time")
  ) {
    return ["worst-ideas-read", WORST_IDEAS_READ_REQUEST_LIMIT];
  }
  if (method === "GET" && path === "/api/account/worst-ideas") {
    return ["worst-ideas-user-read", WORST_IDEAS_USER_READ_REQUEST_LIMIT];
  }
  if (method === "GET" && path === "/api/roast-ranking") {
    return ["roast-ranking-read", ROAST_RANKING_READ_REQUEST_LIMIT];
  }
  if (method === "GET" && stripTrailingSlashes(path) === "/api/best-users") {
    return ["best-users-read", BEST_USERS_READ_REQUEST_LIMIT];
  }
  return undefined;
}

function stripTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end -= 1;
  return path.slice(0, end) || "/";
}

function registrationLimit(path: string): ScopedLimit {
  if (path.includes("verify") || path.includes("confirm")) {
    return ["registration-verification", REGISTRATION_VERIFY_REQUEST_LIMIT];
  }
  if (path.includes("intents")) {
    return ["registration-intent", REGISTRATION_INTENT_REQUEST_LIMIT];
  }
  return ["registration-create", REGISTRATION_REQUEST_LIMIT];
}

function mutationLimit(
  request: SecurityRequest,
  sessionRefreshRequestLimit: number,
): ScopedLimit | undefined {
  const { method, path } = request;
  if (method === "DELETE" && path === "/api/account") {
    return ["account-delete", ACCOUNT_DELETE_REQUEST_LIMIT];
  }
  if (method !== "POST") return undefined;
  if (path === "/api/contact-messages") {
    return ["contact-message", CONTACT_MESSAGE_REQUEST_LIMIT];
  }
  if (isAvatarUploadRequest(request)) {
    return ["account-avatar-upload", AVATAR_UPLOAD_REQUEST_LIMIT];
  }
  if (isLoginRequest(request)) {
    return ["session-login", LOGIN_REQUEST_LIMIT];
  }
  if (path === "/api/auth/logout") {
    return ["session-logout", SESSION_LOGOUT_REQUEST_LIMIT];
  }
  if (path === "/api/auth/password-reset/request") {
    return ["password-reset-request", PASSWORD_RESET_REQUEST_LIMIT];
  }
  if (path === "/api/auth/refresh") {
    return readCookie(request, REFRESH_COOKIE) === undefined
      ? undefined
      : ["session-refresh", sessionRefreshRequestLimit];
  }
  if (path.startsWith("/api/auth/")) {
    return ["session-refresh", sessionRefreshRequestLimit];
  }
  if (
    path.startsWith("/api/registration") ||
    path.startsWith("/api/account/")
  ) {
    return registrationLimit(path);
  }
  return undefined;
}

function requestLimits(
  request: SecurityRequest,
  apiRequestLimit: number,
  sessionRefreshRequestLimit: number,
): ScopedLimit[] {
  const scoped =
    evaluationLimit(request) ??
    readLimit(request) ??
    mutationLimit(request, sessionRefreshRequestLimit);
  return scoped
    ? [["api", apiRequestLimit], scoped]
    : [["api", apiRequestLimit]];
}

function consumeRateLimits(
  limits: ScopedLimit[],
  buckets: Map<string, RateLimitBucket>,
  clientAddress: string,
  now: number,
  response: SecurityResponse,
): boolean {
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
      return true;
    }
    bucket.count += 1;
    if (!buckets.has(key) && buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey) buckets.delete(oldestKey);
    }
    buckets.set(key, bucket);
  }
  return false;
}

function rejectLoginChallenge(
  request: SecurityRequest,
  response: SecurityResponse,
  protection: LoginAbuseProtection,
  clientAddress: string,
  now: number,
): boolean {
  if (!isLoginRequest(request) || !protection.isChallengeModeActive(now)) {
    return false;
  }
  if (
    protection.verifyChallenge(
      clientAddress,
      request.get("x-login-challenge") ?? "",
      request.get("x-login-proof") ?? "",
      now,
    )
  ) {
    return false;
  }
  response.status(428).json({
    statusCode: 428,
    code: "LOGIN_CHALLENGE_REQUIRED",
    message: "Verifica el navegador para continuar.",
    challenge: protection.createChallenge(clientAddress, now),
  });
  return true;
}

function rejectRegistrationQuery(
  request: SecurityRequest,
  response: SecurityResponse,
): boolean {
  if (
    !request.path.startsWith("/api/registration") ||
    !request.originalUrl?.includes("?")
  ) {
    return false;
  }
  response.status(400).json({
    statusCode: 400,
    message: "La URL no admite parámetros para esta solicitud.",
  });
  return true;
}

export function createSecurityMiddleware(
  options: SecurityMiddlewareOptions = {},
): RequestHandler {
  const apiRequestLimit =
    Number.isSafeInteger(options.apiRequestLimit) &&
    Number(options.apiRequestLimit) > 0
      ? Number(options.apiRequestLimit)
      : API_REQUEST_LIMIT;
  const sessionRefreshRequestLimit =
    Number.isSafeInteger(options.sessionRefreshRequestLimit) &&
    Number(options.sessionRefreshRequestLimit) > 0
      ? Number(options.sessionRefreshRequestLimit)
      : REGISTRATION_VERIFY_REQUEST_LIMIT;
  const buckets = new Map<string, RateLimitBucket>();
  const loginAbuseProtection =
    options.loginAbuseProtection ?? new LoginAbuseProtection();
  let requestCount = 0;

  return (request, response, next) => {
    setSecurityHeaders(response);
    if (shouldDisableCaching(request.path)) {
      response.setHeader("Cache-Control", "no-store");
    }
    if (request.method === "OPTIONS") {
      next();
      return;
    }
    if (rejectInvalidMutation(request, response)) return;

    const now = Date.now();
    requestCount += 1;
    if (requestCount % CLEANUP_INTERVAL_REQUESTS === 0) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const clientAddress =
      request.ip ?? request.socket.remoteAddress ?? "unknown";
    if (rejectRegistrationQuery(request, response)) return;
    if (
      rejectBlockedLogin(
        request,
        response,
        loginAbuseProtection,
        clientAddress,
        now,
      )
    )
      return;
    if (
      consumeRateLimits(
        requestLimits(request, apiRequestLimit, sessionRefreshRequestLimit),
        buckets,
        clientAddress,
        now,
        response,
      )
    )
      return;
    if (isLoginRequest(request)) loginAbuseProtection.recordLoginRequest(now);
    if (
      rejectLoginChallenge(
        request,
        response,
        loginAbuseProtection,
        clientAddress,
        now,
      )
    )
      return;

    next();
  };
}

function isAvatarUploadRequest(
  request: Parameters<RequestHandler>[0],
): boolean {
  return request.method === "POST" && request.path === "/api/account/avatar";
}
