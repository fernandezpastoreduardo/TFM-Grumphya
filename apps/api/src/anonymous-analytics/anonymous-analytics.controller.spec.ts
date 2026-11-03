import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AnonymousAnalyticsController } from "./anonymous-analytics.controller";
import { AnonymousAnalyticsService } from "./anonymous-analytics.service";

const WEB_ORIGIN = "https://grumphya.example";
const VALID_EVENT = {
  event: "page_view",
  page: "precios",
  device: "mobile",
  plan: null,
};

describe("AnonymousAnalyticsController", () => {
  it("forwards only the origin and validated aggregate dimensions", async () => {
    const analytics = { record: vi.fn().mockResolvedValue(undefined) };
    const controller = new AnonymousAnalyticsController(
      analytics as unknown as AnonymousAnalyticsService,
    );

    await controller.record(
      { headers: { origin: WEB_ORIGIN } } as never,
      VALID_EVENT,
    );

    expect(analytics.record).toHaveBeenCalledWith(WEB_ORIGIN, VALID_EVENT);
    expect(analytics.record).toHaveBeenCalledTimes(1);
  });

  it("rejects payloads with identifying fields before they reach the service", async () => {
    const analytics = { record: vi.fn() };
    const controller = new AnonymousAnalyticsController(
      analytics as unknown as AnonymousAnalyticsService,
    );

    await expect(
      controller.record({ headers: { origin: WEB_ORIGIN } } as never, {
        ...VALID_EVENT,
        visitorId: "visitor-123",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(analytics.record).not.toHaveBeenCalled();
  });
});
