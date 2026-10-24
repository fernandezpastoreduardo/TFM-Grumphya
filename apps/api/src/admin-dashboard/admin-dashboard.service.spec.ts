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
      getApplicationError: vi.fn(),
      listContactMessages: vi.fn(),
      claimContactMessageReply: vi.fn(),
      completeContactMessageReply: vi.fn(),
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

  it("returns a stored error detail only for a valid event id", async () => {
    const detail = {
      id: "42",
      code: "INVALID_EVALUATION_RESPONSE",
      statusCode: 503,
      occurredAt: "2026-10-24T10:30:00.000Z",
      diagnosticCode: "decision_semantics",
      context: {
        useCase: "idea_evaluation" as const,
        inputText: "Una app para ordenar cajas en un camión",
      },
    };
    const repository = {
      getApplicationError: vi.fn().mockResolvedValue(detail),
    } as unknown as AdminDashboardRepository;
    const service = new AdminDashboardService(repository);

    await expect(service.getApplicationError("42")).resolves.toEqual(detail);
    await expect(service.getApplicationError("0")).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.getApplicationError).toHaveBeenCalledOnce();
  });

  it("returns not found for an expired or unknown diagnostic event", async () => {
    const repository = {
      getApplicationError: vi.fn().mockResolvedValue(null),
    } as unknown as AdminDashboardRepository;
    const service = new AdminDashboardService(repository);

    await expect(service.getApplicationError("42")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("hides database details when diagnostic lookup fails", async () => {
    const repository = {
      getApplicationError: vi
        .fn()
        .mockRejectedValue(new Error(PRIVATE_DATABASE_DETAIL)),
    } as unknown as AdminDashboardRepository;
    const service = new AdminDashboardService(repository);

    await expect(service.getApplicationError("42")).rejects.toMatchObject({
      response: {
        code: "ADMIN_APPLICATION_ERROR_UNAVAILABLE",
        message: "No se ha podido consultar el detalle del error.",
      },
    });
    await expect(service.getApplicationError("42")).rejects.not.toThrow(
      PRIVATE_DATABASE_DETAIL,
    );
  });

  it("hides message repository details when contact messages are unavailable", async () => {
    const repository = {
      getSnapshot: vi.fn(),
      getApplicationError: vi.fn(),
      listContactMessages: vi
        .fn()
        .mockRejectedValue(new Error(PRIVATE_DATABASE_DETAIL)),
      claimContactMessageReply: vi.fn(),
      completeContactMessageReply: vi.fn(),
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
