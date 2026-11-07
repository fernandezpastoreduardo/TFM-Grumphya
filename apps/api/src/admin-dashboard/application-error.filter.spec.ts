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
  it("does not persist expected client errors that an unauthenticated caller can trigger", async () => {
    const { filter, host, repository } = createFilter();

    filter.catch(new HttpException("Forbidden", 403), host);

    expect(repository.recordApplicationError).not.toHaveBeenCalled();
  });

  it("sends the server response without waiting for error persistence", async () => {
    let finishPersistence: (() => void) | undefined;
    const { adapter, filter, host, repository } = createFilter();
    vi.mocked(repository.recordApplicationError).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishPersistence = resolve;
      }),
    );

    filter.catch(new HttpException("Unavailable", 503), host);

    expect(adapter.reply).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(repository.recordApplicationError).toHaveBeenCalledOnce(),
    );
    finishPersistence?.();
  });

  it("keeps the server response when error persistence fails", async () => {
    const { adapter, filter, host, repository } = createFilter();
    vi.mocked(repository.recordApplicationError).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    filter.catch(new HttpException("Unavailable", 503), host);

    expect(adapter.reply).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(repository.recordApplicationError).toHaveBeenCalledOnce(),
    );
  });

  it("persists sanitized server error codes without exception messages", async () => {
    const { filter, host, repository } = createFilter();

    filter.catch(
      new HttpException(
        { code: "ADMIN_DASHBOARD_UNAVAILABLE", message: "private detail" },
        503,
      ),
      host,
    );

    await vi.waitFor(() =>
      expect(repository.recordApplicationError).toHaveBeenCalledWith(
        "ADMIN_DASHBOARD_UNAVAILABLE",
        503,
        undefined,
      ),
    );
  });

  it("does not persist idea text attached to an exception", async () => {
    const { filter, host, repository } = createFilter();
    const exception = Object.assign(
      new HttpException(
        { code: "INVALID_EVALUATION_RESPONSE", message: "generic" },
        503,
      ),
      {
        applicationErrorDiagnostic: "decision_semantics",
        applicationErrorContext: {
          useCase: "idea_evaluation",
          inputText: "Una app para probar una idea",
        },
      },
    );

    filter.catch(exception, host);

    await vi.waitFor(() =>
      expect(repository.recordApplicationError).toHaveBeenCalledWith(
        "INVALID_EVALUATION_RESPONSE",
        503,
        "decision_semantics",
      ),
    );
  });

  it("does not capture request bodies without a trusted evaluation context", async () => {
    const { filter, host, repository } = createFilter();
    const exception = new HttpException(
      { code: "ADMIN_DASHBOARD_UNAVAILABLE", message: "generic" },
      503,
    );

    filter.catch(exception, host);

    await vi.waitFor(() =>
      expect(repository.recordApplicationError).toHaveBeenCalledWith(
        "ADMIN_DASHBOARD_UNAVAILABLE",
        503,
        undefined,
      ),
    );
  });

  it("does not capture evaluation request bodies", async () => {
    const request = {
      method: "POST",
      url: "/api/evaluation-process",
      body: {
        ideaText: "Una app para avisar si el purificador necesita recambio",
      },
    };
    const { filter, repository } = createFilter();
    const host = {
      getArgByIndex: (index: number) =>
        index === 0 ? request : ERROR_RESPONSE,
    } as unknown as ArgumentsHost;

    filter.catch(
      new HttpException({ code: "EVALUATOR_UNAVAILABLE" }, 503),
      host,
    );

    await vi.waitFor(() =>
      expect(repository.recordApplicationError).toHaveBeenCalledWith(
        "EVALUATOR_UNAVAILABLE",
        503,
        undefined,
      ),
    );
  });

  it("does not capture idea text from another route", async () => {
    const request = {
      method: "POST",
      url: "/api/roast",
      body: { ideaText: "texto privado" },
    };
    const { filter, repository } = createFilter();
    const host = {
      getArgByIndex: (index: number) =>
        index === 0 ? request : ERROR_RESPONSE,
    } as unknown as ArgumentsHost;

    filter.catch(new HttpException({ code: "HTTP_503" }, 503), host);

    await vi.waitFor(() =>
      expect(repository.recordApplicationError).toHaveBeenCalledWith(
        "HTTP_503",
        503,
        undefined,
      ),
    );
  });
});
