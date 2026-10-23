import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DataRetentionService } from "./data-retention.service";

describe("DataRetentionService", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the initial bounded cleanup and stops its hourly timer on shutdown", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 0 }),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pool;
    const migrationRunner = vi.fn().mockResolvedValue(undefined);
    const service = new DataRetentionService(pool, migrationRunner);

    await service.onApplicationBootstrap();

    expect(migrationRunner).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalled();
    expect(
      vi
        .mocked(pool.query)
        .mock.calls.some(([sql]) =>
          String(sql).includes("interval '400 days'"),
        ),
    ).toBe(true);
    expect(
      vi
        .mocked(pool.query)
        .mock.calls.some(([sql]) =>
          String(sql).includes("interval '24 months'"),
        ),
    ).toBe(true);

    await service.onApplicationShutdown();

    expect(pool.end).toHaveBeenCalledOnce();
  });
});
