import { describe, expect, it, vi } from "vitest";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";

describe("AdminDashboardController", () => {
  it("returns the dashboard snapshot from its injected service", async () => {
    const snapshot = { revenue: { total: 0 }, commonErrors: [] };
    const service = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      listContactMessages: vi.fn(),
    } as unknown as AdminDashboardService;
    const controller = new AdminDashboardController(service);

    await expect(controller.getDashboard()).resolves.toBe(snapshot);
    expect(service.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("returns recent contact messages from its injected service", async () => {
    const messages = { messages: [] };
    const service = {
      getSnapshot: vi.fn(),
      listContactMessages: vi.fn().mockResolvedValue(messages),
    } as unknown as AdminDashboardService;
    const controller = new AdminDashboardController(service);

    await expect(controller.listContactMessages()).resolves.toBe(messages);
    expect(service.listContactMessages).toHaveBeenCalledTimes(1);
  });
});
