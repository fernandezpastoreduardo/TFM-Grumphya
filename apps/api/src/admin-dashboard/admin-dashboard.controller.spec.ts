import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { AdminRoleGuard } from "./admin-role.guard";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminContactMessageReply } from "./admin-contact-message-reply.service";

describe("AdminDashboardController", () => {
  it("protects diagnostic details with session and administrator guards", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminDashboardController),
    ).toEqual([AccessTokenGuard, AdminRoleGuard]);
  });

  it("returns the dashboard snapshot from its injected service", async () => {
    const snapshot = { revenue: { total: 0 }, commonErrors: [] };
    const service = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      listContactMessages: vi.fn(),
    } as unknown as AdminDashboardService;
    const reply = { execute: vi.fn() } as unknown as AdminContactMessageReply;
    const controller = new AdminDashboardController(service, reply);

    await expect(controller.getDashboard()).resolves.toBe(snapshot);
    expect(service.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("returns recent contact messages from its injected service", async () => {
    const messages = { messages: [] };
    const service = {
      getSnapshot: vi.fn(),
      listContactMessages: vi.fn().mockResolvedValue(messages),
    } as unknown as AdminDashboardService;
    const reply = { execute: vi.fn() } as unknown as AdminContactMessageReply;
    const controller = new AdminDashboardController(service, reply);

    await expect(controller.listContactMessages()).resolves.toBe(messages);
    expect(service.listContactMessages).toHaveBeenCalledTimes(1);
  });

  it("returns the requested error detail from its injected service", async () => {
    const detail = { id: "42", code: "INVALID_EVALUATION_RESPONSE" };
    const service = {
      getApplicationError: vi.fn().mockResolvedValue(detail),
    } as unknown as AdminDashboardService;
    const reply = { execute: vi.fn() } as unknown as AdminContactMessageReply;
    const controller = new AdminDashboardController(service, reply);

    await expect(controller.getApplicationError("42")).resolves.toBe(detail);
    expect(service.getApplicationError).toHaveBeenCalledWith("42");
  });

  it("forwards the authenticated admin and message body to the reply use case", async () => {
    const service = {} as AdminDashboardService;
    const replyResult = { status: "sent" };
    const reply = {
      execute: vi.fn().mockResolvedValue(replyResult),
    } as unknown as AdminContactMessageReply;
    const controller = new AdminDashboardController(service, reply);
    const request = { user: { userId: "admin-from-auth" } } as never;
    const body = { response: "Gracias por escribirnos." };

    await expect(
      controller.replyToContactMessage(request, "contact-id", body),
    ).resolves.toBe(replyResult);
    expect(reply.execute).toHaveBeenCalledWith(
      "admin-from-auth",
      "contact-id",
      body,
    );
  });
});
