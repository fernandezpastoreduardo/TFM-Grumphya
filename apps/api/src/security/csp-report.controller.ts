import { Body, Controller, HttpCode, Logger, Post } from "@nestjs/common";

const MAX_REPORTS_PER_REQUEST = 10;
const MAX_FIELD_LENGTH = 2048;
const logger = new Logger("CspReport");

type CspReportFields = {
  "document-uri"?: unknown;
  documentURL?: unknown;
  "blocked-uri"?: unknown;
  blockedURL?: unknown;
  "source-file"?: unknown;
  sourceFile?: unknown;
  "effective-directive"?: unknown;
  effectiveDirective?: unknown;
  "violated-directive"?: unknown;
  violatedDirective?: unknown;
  disposition?: unknown;
  "line-number"?: unknown;
  lineNumber?: unknown;
  "status-code"?: unknown;
  statusCode?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, MAX_FIELD_LENGTH);
}

function safeLocation(value: unknown): string | undefined {
  const location = safeString(value);
  if (!location) return undefined;
  if (location === "inline" || location === "eval" || location === "self") {
    return location;
  }
  if (location.startsWith("data:")) return "data:";
  if (location.startsWith("blob:")) return "blob:";

  try {
    const parsed = new URL(
      location,
      process.env.WEB_ORIGIN ?? "http://localhost",
    );
    const configuredOrigin = process.env.WEB_ORIGIN ?? "http://localhost";
    if (parsed.origin === configuredOrigin) return parsed.pathname;
    return `${parsed.origin}/`;
  } catch {
    return undefined;
  }
}

function sanitizeCspReport(value: unknown) {
  if (!isRecord(value)) return undefined;
  const report = value as CspReportFields;
  const result = {
    document: safeLocation(report["document-uri"] ?? report.documentURL),
    blocked: safeLocation(report["blocked-uri"] ?? report.blockedURL),
    source: safeLocation(report["source-file"] ?? report.sourceFile),
    directive:
      safeString(report["effective-directive"]) ??
      safeString(report.effectiveDirective) ??
      safeString(report["violated-directive"]) ??
      safeString(report.violatedDirective),
    disposition: safeString(report.disposition),
    line: Number.isSafeInteger(report["line-number"] ?? report.lineNumber)
      ? (report["line-number"] ?? report.lineNumber)
      : undefined,
    status: Number.isSafeInteger(report["status-code"] ?? report.statusCode)
      ? (report["status-code"] ?? report.statusCode)
      : undefined,
  };
  return Object.values(result).some((field) => field !== undefined)
    ? result
    : undefined;
}

function extractReports(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
      .slice(0, MAX_REPORTS_PER_REQUEST)
      .filter(isRecord)
      .filter((report) => report.type === "csp-violation")
      .map((report) => report.body);
  }
  if (!isRecord(payload)) return [];
  if ("csp-report" in payload) return [payload["csp-report"]];
  return [payload];
}

@Controller("csp-reports")
export class CspReportController {
  @Post()
  @HttpCode(204)
  receive(@Body() payload: unknown): void {
    for (const report of extractReports(payload)) {
      const sanitized = sanitizeCspReport(report);
      if (sanitized)
        logger.warn(JSON.stringify({ event: "csp_violation", ...sanitized }));
    }
  }
}

export const cspReportInternals = { extractReports, sanitizeCspReport };
