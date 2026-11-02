import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresScanStore, type ScanRunInput } from "./scan-store.js";

const VALID_REPORT: ScanRunInput = {
  jobId: "job-id",
  leaseToken: "lease-token",
  hostname: "grumphya.com",
  profileVersion: "controls-v1",
  scannerVersion: "scanner-v1",
  startedAt: new Date("2026-11-02T10:00:00.000Z"),
  completedAt: new Date("2026-11-02T10:01:00.000Z"),
  verdict: "pass",
  scope: ["/"],
  checks: [
    {
      controlId: "DS-HTTP-01",
      status: "pass",
      required: true,
      severity: "high",
      observedAt: new Date("2026-11-02T10:01:00.000Z"),
      targetPath: "/",
      method: "HEAD",
      summary: "Respuesta recibida.",
      limitation: "Prueba de unidad.",
      evidence: {
        statusCode: 200,
        redirectedToHttps: true,
        finalScheme: "https",
      },
    },
  ],
  metrics: {
    requestsCount: 1,
    bytesCount: 0,
    durationMs: 1,
    pagesCount: 1,
  },
};

describe("PostgresScanStore unit behavior", () => {
  it("reports storage health as false when the database query fails", async () => {
    const pool = makePool({
      query: vi.fn().mockRejectedValue(new Error("db")),
    });
    const store = new PostgresScanStore(pool);

    await expect(store.healthCheck()).resolves.toBe(false);
  });

  it.each([0, -1, 5 * 60 * 1000 + 1, 1.5, Number.NaN])(
    "rejects invalid lease duration %s before querying the database",
    async (leaseDurationMs) => {
      const query = vi.fn();
      const store = new PostgresScanStore(makePool({ query }));

      await expect(
        store.claimNextScan(new Date(), leaseDurationMs),
      ).rejects.toThrow("invalid_scan_lease_duration");
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid retry limits before querying the database", async () => {
    const query = vi.fn();
    const store = new PostgresScanStore(makePool({ query }));

    await expect(store.recoverExpiredLeases(new Date(), 0)).rejects.toThrow(
      "invalid_scan_max_attempts",
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a report whose verdict does not match required controls before opening a transaction", async () => {
    const connect = vi.fn();
    const store = new PostgresScanStore(makePool({ connect }));

    await expect(
      store.completeScan({ ...VALID_REPORT, verdict: "fail" }),
    ).rejects.toThrow("scan_verdict_does_not_match_checks");
    expect(connect).not.toHaveBeenCalled();
  });

  it("persists only allowlisted evidence and generated summaries", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ds_complete_scan: "run-id" }],
    });
    const store = new PostgresScanStore(makePool({ query }));
    const report = {
      ...VALID_REPORT,
      verdict: "inconclusive" as const,
      checks: [
        {
          ...VALID_REPORT.checks[0],
          summary: "<html>private page contents</html>",
          limitation: "Cookie: session=secret-value",
          evidence: {
            requestCount: 1,
            html: "private page contents",
            cookie: "session=secret-value",
          },
        },
      ],
    };

    await expect(store.completeScan(report)).resolves.toBe("run-id");

    const persistedChecks = JSON.parse(query.mock.calls[0][1][7] as string) as [
      {
        summary: string;
        limitation: string;
        evidence: Record<string, unknown>;
      },
    ];
    expect(persistedChecks[0].summary).not.toContain("private page contents");
    expect(persistedChecks[0].limitation).not.toContain("secret-value");
    expect(persistedChecks[0].evidence).toEqual({});
  });

  it("rejects an unknown profile before writing to the database", async () => {
    const query = vi.fn();
    const store = new PostgresScanStore(makePool({ query }));

    await expect(
      store.completeScan({ ...VALID_REPORT, profileVersion: "controls-v2" }),
    ).rejects.toThrow("scan_profile_not_allowlisted");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an out-of-scope path and method before writing to the database", async () => {
    const query = vi.fn();
    const store = new PostgresScanStore(makePool({ query }));

    await expect(
      store.completeScan({ ...VALID_REPORT, scope: ["/", "/admin"] }),
    ).rejects.toThrow("scan_scope_not_allowlisted");
    await expect(
      store.completeScan({
        ...VALID_REPORT,
        checks: [{ ...VALID_REPORT.checks[0], method: "POST" }],
      }),
    ).rejects.toThrow("scan_check_scope_not_allowlisted");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects invalid structured evidence before writing to the database", async () => {
    const query = vi.fn();
    const store = new PostgresScanStore(makePool({ query }));

    await expect(
      store.completeScan({
        ...VALID_REPORT,
        checks: [
          {
            ...VALID_REPORT.checks[0],
            evidence: { statusCode: 99 },
          },
        ],
      }),
    ).rejects.toThrow("scan_evidence_invalid");
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["DS-DNS-01", "DNS", {}],
    [
      "DS-DNS-01",
      "DNS",
      { addressClass: "private", aRecordCount: 1, aaaaRecordCount: 0 },
    ],
    [
      "DS-TLS-01",
      "TLS",
      { protocol: "TLSv1.3", certificateValid: false, hostnameMatches: true },
    ],
    [
      "DS-TLS-02",
      "TLS",
      {
        tls10Accepted: true,
        tls11Accepted: false,
        tls12Accepted: true,
        tls13Accepted: true,
      },
    ],
    [
      "DS-HTTP-01",
      "GET",
      { statusCode: 500, redirectedToHttps: true, finalScheme: "https" },
    ],
    [
      "DS-HTTP-01",
      "GET",
      { statusCode: 200, redirectedToHttps: true, finalScheme: "http" },
    ],
    ["DS-PRIV-01", "GET", { thirdPartyAttempts: 1, blockedRequests: 1 }],
    [
      "DS-PRIV-02",
      "GET",
      {
        cookieCount: 1,
        insecureCookieCount: 1,
        thirdPartyCookieCount: 0,
        inspected: true,
      },
    ],
    ["DS-PRIV-03", "GET", { mixedContentCount: 1, insecureNavigationCount: 0 }],
    [
      "DS-QUAL-01",
      "GET",
      { documentStatusCode: 200, failedEssentialResourceCount: 1 },
    ],
  ])(
    "does not submit a pass with insufficient or contradictory %s evidence",
    async (controlId, method, evidence) => {
      const query = vi.fn();
      const store = new PostgresScanStore(makePool({ query }));

      await expect(
        store.completeScan({
          ...VALID_REPORT,
          checks: [{ ...VALID_REPORT.checks[0], controlId, method, evidence }],
        }),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("drops TLS expiry metadata because it is outside the evidence contract", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ds_complete_scan: "run-id" }],
    });
    const store = new PostgresScanStore(makePool({ query }));

    await store.completeScan({
      ...VALID_REPORT,
      verdict: "pass",
      checks: [
        {
          ...VALID_REPORT.checks[0],
          controlId: "DS-TLS-01",
          method: "TLS",
          evidence: {
            protocol: "TLSv1.3",
            certificateValid: true,
            hostnameMatches: true,
            expiresAt: "2027-04-05T06:07:08.000Z",
          },
        },
      ],
    });

    const persistedChecks = JSON.parse(query.mock.calls[0][1][7] as string) as [
      { evidence: Record<string, unknown> },
    ];
    expect(persistedChecks[0].evidence).toEqual({
      protocol: "TLSv1.3",
      certificateValid: true,
      hostnameMatches: true,
    });
  });

  it("persists an HTTP status at the maximum allowed boundary", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ ds_complete_scan: "run-id" }],
    });
    const store = new PostgresScanStore(makePool({ query }));

    await store.completeScan({
      ...VALID_REPORT,
      verdict: "fail",
      checks: [
        {
          ...VALID_REPORT.checks[0],
          evidence: {
            statusCode: 599,
            redirectedToHttps: true,
            finalScheme: "https",
          },
        },
      ],
    });

    const persistedChecks = JSON.parse(query.mock.calls[0][1][7] as string) as [
      { evidence: Record<string, unknown> },
    ];
    expect(persistedChecks[0].evidence.statusCode).toBe(599);
  });

  it("closes the underlying connection pool", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const store = new PostgresScanStore(makePool({ end }));

    await store.close();

    expect(end).toHaveBeenCalledOnce();
  });

  function makePool(overrides: Record<string, unknown>): Pool {
    return {
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
      ...overrides,
    } as unknown as Pool;
  }
});
