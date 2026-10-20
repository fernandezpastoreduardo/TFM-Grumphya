import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AdminDashboardRepository } from "./admin-dashboard.models";
import { AdminDashboardService } from "./admin-dashboard.service";

const PRIVATE_DATABASE_DETAIL = "password=private; idea=private";
const DASHBOARD_UNAVAILABLE_MESSAGE =
  "No se han podido consultar las métricas ahora.";

describe("AdminDashboardService", () => {
  it("hides repository details when dashboard metrics are unavailable", async () => {
    const repository = {
      getSnapshot: vi
        .fn()
        .mockRejectedValue(new Error(PRIVATE_DATABASE_DETAIL)),
      listContactMessages: vi.fn(),
      recordAiUsage: vi.fn(),
      recordApplicationError: vi.fn(),
    } satisfies Partial<AdminDashboardRepository>;
    const service = new AdminDashboardService(
      repository as AdminDashboardRepository,
    );

    const request = service.getSnapshot();

    await expect(request).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(request).rejects.toMatchObject({
      response: {
        message: DASHBOARD_UNAVAILABLE_MESSAGE,
      },
    });
    await expect(request).rejects.not.toThrow(PRIVATE_DATABASE_DETAIL);
  });

  it("hides message repository details when contact messages are unavailable", async () => {
    const repository = {
      getSnapshot: vi.fn(),
      listContactMessages: vi
        .fn()
        .mockRejectedValue(new Error(PRIVATE_DATABASE_DETAIL)),
      recordAiUsage: vi.fn(),
      recordApplicationError: vi.fn(),
    } satisfies Partial<AdminDashboardRepository>;
    const service = new AdminDashboardService(
      repository as AdminDashboardRepository,
    );

    const request = service.listContactMessages();

    await expect(request).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(request).rejects.toMatchObject({
      response: {
        message: "No se han podido consultar los mensajes ahora.",
      },
    });
    await expect(request).rejects.not.toThrow(PRIVATE_DATABASE_DETAIL);
  });
});
