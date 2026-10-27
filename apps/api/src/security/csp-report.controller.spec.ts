import "reflect-metadata";
import { Module, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CspReportController,
  cspReportInternals,
} from "./csp-report.controller";

const WEB_ORIGIN = "https://grumphya.com";

describe("CSP report sanitization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes query strings and fragments from same-origin URLs", () => {
    vi.stubEnv("WEB_ORIGIN", WEB_ORIGIN);

    expect(
      cspReportInternals.sanitizeCspReport({
        "document-uri": `${WEB_ORIGIN}/idea?private=value#result`,
        "blocked-uri": "https://tracker.example/pixel?id=private",
        "effective-directive": "img-src",
      }),
    ).toEqual({
      document: "/idea",
      blocked: "https://tracker.example/",
      source: undefined,
      directive: "img-src",
      disposition: undefined,
      line: undefined,
      status: undefined,
    });
  });

  it("discards data payloads and accepts modern CSP report batches", () => {
    vi.stubEnv("WEB_ORIGIN", WEB_ORIGIN);

    expect(
      cspReportInternals.sanitizeCspReport({
        "document-uri": "https://grumphya.com/",
        "blocked-uri": "data:text/html,private-content",
        "effective-directive": "img-src",
      })?.blocked,
    ).toBe("data:");
    expect(
      cspReportInternals.extractReports([
        {
          type: "csp-violation",
          body: {
            effectiveDirective: "script-src",
            documentURL: `${WEB_ORIGIN}/login?token=private`,
            blockedURL: "https://tracker.example/pixel?id=private",
          },
        },
        { type: "deprecation", body: {} },
      ]),
    ).toEqual([
      {
        effectiveDirective: "script-src",
        documentURL: `${WEB_ORIGIN}/login?token=private`,
        blockedURL: "https://tracker.example/pixel?id=private",
      },
    ]);
    expect(
      cspReportInternals.sanitizeCspReport({
        effectiveDirective: "script-src",
        documentURL: `${WEB_ORIGIN}/login?token=private`,
        blockedURL: "https://tracker.example/pixel?id=private",
      }),
    ).toMatchObject({
      document: "/login",
      blocked: "https://tracker.example/",
      directive: "script-src",
    });
  });

  it("accepts legacy reports and ignores malformed payloads", () => {
    expect(
      cspReportInternals.extractReports({
        "csp-report": { "blocked-uri": "inline" },
      }),
    ).toEqual([{ "blocked-uri": "inline" }]);
    expect(cspReportInternals.extractReports(null)).toEqual([]);
    expect(cspReportInternals.extractReports({ unexpected: true })).toEqual([
      { unexpected: true },
    ]);
  });
});

class CspReportHttpTestModule {}
Module({ controllers: [CspReportController] })(CspReportHttpTestModule);

describe("POST /api/csp-reports", () => {
  let app: NestExpressApplication;
  let endpoint: string;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(
      CspReportHttpTestModule,
      { logger: false },
    );
    app.setGlobalPrefix("api");
    app.useBodyParser("json", {
      limit: "8kb",
      type: [
        "application/json",
        "application/csp-report",
        "application/reports+json",
      ],
    });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (typeof address !== "object" || address === null) {
      throw new Error("CSP report test server did not start.");
    }
    endpoint = `http://127.0.0.1:${address.port}/api/csp-reports`;
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("accepts legacy and modern report formats without logging URL queries", async () => {
    vi.stubEnv("WEB_ORIGIN", WEB_ORIGIN);
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});

    const legacyResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/csp-report" },
      body: JSON.stringify({
        "csp-report": {
          "document-uri": `${WEB_ORIGIN}/login?token=private`,
          "blocked-uri": "inline",
          "violated-directive": "script-src",
        },
      }),
    });
    const modernResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/reports+json" },
      body: JSON.stringify([
        {
          type: "csp-violation",
          body: {
            documentURL: `${WEB_ORIGIN}/perfil?token=private`,
            blockedURL: "https://tracker.example/collect?secret=private",
            effectiveDirective: "connect-src",
          },
        },
      ]),
    });

    expect(legacyResponse.status).toBe(204);
    expect(modernResponse.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      JSON.stringify({
        event: "csp_violation",
        document: "/login",
        blocked: "inline",
        source: undefined,
        directive: "script-src",
        disposition: undefined,
        line: undefined,
        status: undefined,
      }),
      JSON.stringify({
        event: "csp_violation",
        document: "/perfil",
        blocked: "https://tracker.example/",
        source: undefined,
        directive: "connect-src",
        disposition: undefined,
        line: undefined,
        status: undefined,
      }),
    ]);
  });
});
