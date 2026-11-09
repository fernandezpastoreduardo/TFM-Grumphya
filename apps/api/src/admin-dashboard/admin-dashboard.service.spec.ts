import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AdminDashboardRepository } from "./admin-dashboard.models";
import { AdminDashboardService } from "./admin-dashboard.service";
import { LoginAbuseProtection } from "../security/login-abuse-protection.service";

const PRIVATE_DATABASE_DETAIL = "password=private; idea=private";
const DASHBOARD_UNAVAILABLE_MESSAGE =
  "No se han podido consultar las métricas ahora.";

describe("AdminDashboardService", () => {
  it("replaces repository placeholder data with live aggregate login metrics", async () => {
    const snapshot = {
      recentAiActivity: [],
      loginSecurity: {
        windowMinutes: 15,
        loginRequests: 0,
        challengesIssued: 0,
        challengesAccepted: 0,
        challengesRejected: 0,
        failedLogins: 0,
        blockedRequests: 0,
        activeBlockedAddresses: 0,
        attackModeActive: false,
      },
    };
    const liveMetrics = {
      windowMinutes: 15,
      loginRequests: 12,
      challengesIssued: 3,
      challengesAccepted: 2,
      challengesRejected: 1,
      failedLogins: 2,
      blockedRequests: 4,
      activeBlockedAddresses: 1,
      attackModeActive: true,
    } as const;
    const repository = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as AdminDashboardRepository;
    const loginAbuseProtection = {
      getAdminSnapshot: vi.fn().mockReturnValue(liveMetrics),
    } as unknown as LoginAbuseProtection;
    const service = new AdminDashboardService(repository, loginAbuseProtection);

    await expect(service.getSnapshot()).resolves.toEqual({
      ...snapshot,
      loginSecurity: liveMetrics,
    });
    expect(loginAbuseProtection.getAdminSnapshot).toHaveBeenCalledOnce();
  });

  it("hides repository details when dashboard metrics are unavailable", async () => {
    const repository = {
      getSnapshot: vi
        .fn()
        .mockRejectedValue(new Error(PRIVATE_DATABASE_DETAIL)),
      getAnonymousAnalytics: vi.fn(),
      getLighthouseQuality: vi.fn(),
      saveLighthouseQuality: vi.fn(),
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
    expect(repository.getApplicationError).toHaveBeenCalledOnce();
  });

  it.each(["0", "01", "-1", "not-an-id", "9223372036854775808"])(
    "rejects invalid or out-of-range error event id %s",
    async (id) => {
      const repository = {
        getApplicationError: vi.fn(),
      } as unknown as AdminDashboardRepository;
      const service = new AdminDashboardService(repository);

      await expect(service.getApplicationError(id)).rejects.toMatchObject({
        status: 400,
      });
      expect(repository.getApplicationError).not.toHaveBeenCalled();
    },
  );

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
      getAnonymousAnalytics: vi.fn(),
      getLighthouseQuality: vi.fn(),
      saveLighthouseQuality: vi.fn(),
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
