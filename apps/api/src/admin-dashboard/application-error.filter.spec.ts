import { HttpException, type ArgumentsHost } from "@nestjs/common";
import type { HttpAdapterHost } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { ApplicationErrorFilter } from "./application-error.filter";
import type { AdminDashboardRepository } from "./admin-dashboard.models";

const ERROR_REQUEST = { method: "GET", url: "/api/admin/dashboard" };
const ERROR_RESPONSE = {};

function createFilter() {
  const adapter = { isHeadersSent: () => false, reply: vi.fn(), end: vi.fn() };
  const repository = {
    recordApplicationError: vi.fn().mockResolvedValue(undefined),
  } as unknown as AdminDashboardRepository;
  const filter = new ApplicationErrorFilter(
    { httpAdapter: adapter } as unknown as HttpAdapterHost,
    repository,
  );
  const host = {
    getArgByIndex: (index: number) =>
      index === 0 ? ERROR_REQUEST : ERROR_RESPONSE,
    switchToHttp: () => ({
      getRequest: () => ERROR_REQUEST,
      getResponse: () => ERROR_RESPONSE,
    }),
  } as unknown as ArgumentsHost;
  return { adapter, filter, host, repository };
}

describe("ApplicationErrorFilter", () => {
  it("does not persist expected client errors that an unauthenticated caller can trigger", () => {
    const { filter, host, repository } = createFilter();

    filter.catch(new HttpException("Forbidden", 403), host);

    expect(repository.recordApplicationError).not.toHaveBeenCalled();
  });

  it("persists sanitized server error codes without exception messages", () => {
    const { filter, host, repository } = createFilter();

    filter.catch(
      new HttpException(
        { code: "ADMIN_DASHBOARD_UNAVAILABLE", message: "private detail" },
        503,
      ),
      host,
    );

    expect(repository.recordApplicationError).toHaveBeenCalledWith(
      "ADMIN_DASHBOARD_UNAVAILABLE",
      503,
    );
  });
});
