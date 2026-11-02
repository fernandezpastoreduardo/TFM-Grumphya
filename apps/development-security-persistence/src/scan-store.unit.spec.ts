import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresScanStore, type ScanRunInput } from "./scan-store.js";

const VALID_REPORT: ScanRunInput = {
  jobId: "job-id",
  leaseToken: "lease-token",
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
      evidence: {},
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
