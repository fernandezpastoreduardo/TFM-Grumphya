import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  LighthouseQualityService,
  parseLighthouseQualityPayload,
} from "./lighthouse-quality";
import type {
  LighthouseDevice,
  LighthousePageCode,
  LighthouseQualityRun,
  AdminDashboardRepository,
} from "./admin-dashboard.models";

const COMMIT_SHA = "a".repeat(40);
const MEASURED_AT = "2026-11-09T12:00:00.000Z";
const PAGES: LighthousePageCode[] = ["home", "precios", "lo-peor-de-lo-peor"];
const DEVICES: LighthouseDevice[] = ["mobile", "desktop"];

function createRun(
  page: LighthousePageCode,
  device: LighthouseDevice,
): LighthouseQualityRun {
  return {
    commitSha: COMMIT_SHA,
    measuredAt: MEASURED_AT,
    page,
    device,
    sampleCount: 3,
    performance: 0.9,
    accessibility: 1,
    bestPractices: 0.96,
    seo: 1,
    lcpMs: 1234,
    cls: 0.02,
    tbtMs: 10,
    speedIndexMs: 2345,
  };
}

function createPayload() {
  return {
    runs: PAGES.flatMap((page) =>
      DEVICES.map((device) => createRun(page, device)),
    ),
  };
}

describe("LighthouseQualityService", () => {
  it("accepts exactly six synthetic page and device summaries", () => {
    expect(parseLighthouseQualityPayload(createPayload())).toHaveLength(6);
  });

  it.each([
    ["an extra field", () => ({ ...createPayload(), visitorId: "private" })],
    [
      "a visitor identifier",
      () => ({
        runs: [
          { ...createPayload().runs[0], sessionId: "private" },
          ...createPayload().runs.slice(1),
        ],
      }),
    ],
    [
      "a malformed score",
      () => ({
        runs: [
          { ...createPayload().runs[0], performance: 2 },
          ...createPayload().runs.slice(1),
        ],
      }),
    ],
    [
      "a missing device combination",
      () => ({ runs: createPayload().runs.slice(0, 5) }),
    ],
  ])("rejects reports with %s", (_description, createInvalidPayload) => {
    expect(() => parseLighthouseQualityPayload(createInvalidPayload())).toThrow(
      BadRequestException,
    );
  });

  it("persists only validated summary runs", async () => {
    const repository = {
      saveLighthouseQuality: vi.fn().mockResolvedValue(undefined),
    } as unknown as AdminDashboardRepository;
    const service = new LighthouseQualityService(repository);

    await expect(service.ingest(createPayload())).resolves.toEqual({
      accepted: 6,
    });
    expect(repository.saveLighthouseQuality).toHaveBeenCalledWith(
      createPayload().runs,
    );
  });
});
