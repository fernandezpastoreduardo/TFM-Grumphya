import { describe, expect, it, vi } from "vitest";
import { ScanJobProcessor } from "./scan-job-processor.js";
import {
  ScanLeaseLostError,
  type ClaimedScanJob,
  type ScanJobStore,
  type ScanRunInput,
} from "@grumphya/development-security-persistence";

const LEASE_TOKEN = "fixture-lease-token";
const JOB: ClaimedScanJob = {
  id: "d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1",
  hostname: "sample.example.net",
  profileVersion: "controls-v1",
  trigger: "requested",
  attempts: 1,
  leaseToken: LEASE_TOKEN,
  leaseUntil: new Date("2026-11-02T10:01:00.000Z"),
};

const RESULT: Omit<ScanRunInput, "jobId" | "leaseToken"> = {
  scannerVersion: "scanner-test-version",
  startedAt: new Date("2026-11-02T10:00:00.000Z"),
  completedAt: new Date("2026-11-02T10:00:30.000Z"),
  verdict: "inconclusive",
  scope: ["/"],
  checks: [
    {
      controlId: "DS-DNS-01",
      status: "unknown",
      required: true,
      severity: "high",
      observedAt: new Date("2026-11-02T10:00:30.000Z"),
      targetPath: "/",
      method: "DNS",
      summary: "Prueba de almacenamiento sin conexión externa.",
      limitation: "No es un resultado operativo.",
      evidence: {},
    },
  ],
  metrics: {
    requestsCount: 0,
    bytesCount: 0,
    durationMs: 0,
    pagesCount: 0,
  },
};

describe("ScanJobProcessor", () => {
  it("does nothing when the queue is empty", async () => {
    const store = makeStore(null);
    const executor = { execute: vi.fn() };
    const processor = new ScanJobProcessor(store, executor);

    await expect(processor.processNext()).resolves.toBe("idle");
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("commits the executor result under the claimed lease", async () => {
    const store = makeStore(JOB);
    const executor = { execute: vi.fn().mockResolvedValue(RESULT) };
    const processor = new ScanJobProcessor(store, executor);

    await expect(processor.processNext()).resolves.toBe("completed");
    expect(store.completeScan).toHaveBeenCalledWith({
      ...RESULT,
      jobId: JOB.id,
      leaseToken: LEASE_TOKEN,
    });
  });

  it("does not persist a verdict that contradicts the required checks", async () => {
    const store = makeStore(JOB);
    const executor = {
      execute: vi.fn().mockResolvedValue({ ...RESULT, verdict: "pass" }),
    };
    const processor = new ScanJobProcessor(store, executor);

    await expect(processor.processNext()).rejects.toThrow(
      "scan_verdict_does_not_match_checks",
    );
    expect(store.completeScan).not.toHaveBeenCalled();
  });

  it("drops results from a worker whose lease has been replaced", async () => {
    const store = makeStore(JOB);
    vi.mocked(store.completeScan).mockRejectedValue(new ScanLeaseLostError());
    const processor = new ScanJobProcessor(store, {
      execute: vi.fn().mockResolvedValue(RESULT),
    });

    await expect(processor.processNext()).resolves.toBe("lease_lost");
  });

  it("aborts work when it can no longer renew the lease", async () => {
    const store = makeStore(JOB);
    vi.mocked(store.renewScanLease).mockResolvedValue(false);
    let receivedSignal: AbortSignal | undefined;
    const executor = {
      execute: vi.fn(async (_job: ClaimedScanJob, signal: AbortSignal) => {
        receivedSignal = signal;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return RESULT;
      }),
    };
    const processor = new ScanJobProcessor(
      store,
      executor,
      () => new Date(),
      1,
    );

    await expect(processor.processNext()).resolves.toBe("lease_lost");
    expect(receivedSignal?.aborted).toBe(true);
    expect(store.completeScan).not.toHaveBeenCalled();
  });

  it("aborts work and discards results when lease renewal errors", async () => {
    const store = makeStore(JOB);
    vi.mocked(store.renewScanLease).mockRejectedValue(new Error("database"));
    let receivedSignal: AbortSignal | undefined;
    const executor = {
      execute: vi.fn(async (_job: ClaimedScanJob, signal: AbortSignal) => {
        receivedSignal = signal;
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        return RESULT;
      }),
    };
    const processor = new ScanJobProcessor(
      store,
      executor,
      () => new Date(),
      1,
    );

    await expect(processor.processNext()).resolves.toBe("lease_lost");
    expect(receivedSignal?.aborted).toBe(true);
    expect(store.completeScan).not.toHaveBeenCalled();
  });

  it("propagates executor failures without attempting to persist a report", async () => {
    const store = makeStore(JOB);
    const processor = new ScanJobProcessor(store, {
      execute: vi.fn().mockRejectedValue(new Error("probe_failed")),
    });

    await expect(processor.processNext()).rejects.toThrow("probe_failed");
    expect(store.completeScan).not.toHaveBeenCalled();
  });

  function makeStore(job: ClaimedScanJob | null): ScanJobStore & {
    claimNextScan: ReturnType<typeof vi.fn>;
    completeScan: ReturnType<typeof vi.fn>;
  } {
    return {
      claimNextScan: vi.fn().mockResolvedValue(job),
      renewScanLease: vi.fn().mockResolvedValue(true),
      completeScan: vi.fn().mockResolvedValue("run-id"),
    };
  }
});
