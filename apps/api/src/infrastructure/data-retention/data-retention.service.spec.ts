import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DataRetentionService } from "./data-retention.service";

describe("DataRetentionService", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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
    const allTimeAggregateCleanup = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) =>
        String(sql).includes("DELETE FROM rejected_idea_all_time_counts"),
      )?.[0];
    expect(allTimeAggregateCleanup).toContain("last_received_at");
    expect(allTimeAggregateCleanup).toContain("interval '24 months'");
    expect(allTimeAggregateCleanup).toContain("LIMIT 500");
    const applicationErrorCleanup = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) =>
        String(sql).includes("DELETE FROM application_error_events"),
      )?.[0];
    expect(applicationErrorCleanup).toContain("interval '30 days'");
    expect(applicationErrorCleanup).toContain("LIMIT 500");
    const anonymousAnalyticsCleanup = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) =>
        String(sql).includes("DELETE FROM anonymous_analytics_daily"),
      )?.[0];
    expect(anonymousAnalyticsCleanup).toContain("interval '13 months'");
    expect(anonymousAnalyticsCleanup).toContain("LIMIT 500");
    const lighthouseCleanup = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) =>
        String(sql).includes("DELETE FROM admin_lighthouse_quality_runs"),
      )?.[0];
    expect(lighthouseCleanup).toContain("interval '90 days'");
    expect(lighthouseCleanup).toContain("LIMIT 500");

    await service.onApplicationShutdown();

    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("retries schema initialization and cleanup on the next hourly interval", async () => {
    vi.useFakeTimers();
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 0 }),
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pool;
    const migrationRunner = vi
      .fn()
      .mockRejectedValueOnce(new Error("migration temporarily unavailable"))
      .mockResolvedValue(undefined);
    const service = new DataRetentionService(pool, migrationRunner);

    await service.onApplicationBootstrap();
    expect(migrationRunner).toHaveBeenCalledOnce();
    expect(pool.query).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(migrationRunner).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenCalled();
    await service.onApplicationShutdown();
  });
});
