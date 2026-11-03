import { ForbiddenException, HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AnonymousAnalyticsService } from "./anonymous-analytics.service";
import type { AnonymousAnalyticsInput } from "./anonymous-analytics.models";

const WEB_ORIGIN = "https://grumphya.example";
const APPROVED_EVENT: AnonymousAnalyticsInput = {
  event: "plan_selection",
  page: "precios",
  device: "mobile",
  plan: "ILUMINADO",
};

describe("AnonymousAnalyticsService", () => {
  it("increments an aggregate counter without persisting request identifiers", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as Pool;
    const service = new AnonymousAnalyticsService(pool, WEB_ORIGIN);

    await service.record(WEB_ORIGIN, APPROVED_EVENT);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO anonymous_analytics_daily"),
      ["plan_selection", "precios", "mobile", "ILUMINADO"],
    );
  });

  it("rejects events from a different origin", async () => {
    const query = vi.fn();
    const service = new AnonymousAnalyticsService(
      { query } as unknown as Pool,
      WEB_ORIGIN,
    );

    await expect(
      service.record("https://outside.example", APPROVED_EVENT),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it("applies a process-wide limit without using client identifiers", async () => {
    let currentTime = 1_000;
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const service = new AnonymousAnalyticsService(
      { query } as unknown as Pool,
      WEB_ORIGIN,
      () => currentTime,
    );

    for (let index = 0; index < 600; index += 1) {
      await service.record(WEB_ORIGIN, APPROVED_EVENT);
    }
    await expect(
      service.record(WEB_ORIGIN, APPROVED_EVENT),
    ).rejects.toBeInstanceOf(HttpException);
    currentTime += 60_000;
    await expect(
      service.record(WEB_ORIGIN, APPROVED_EVENT),
    ).resolves.toBeUndefined();
  });
});
