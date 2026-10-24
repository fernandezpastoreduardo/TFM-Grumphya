import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresAdminDashboardRepository } from "./postgres-admin-dashboard.repository";

vi.mock("../infrastructure/database/run-migrations", () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

const SUMMARY_ROW = {
  weekly_revenue_eur: "4",
  total_revenue_eur: "8",
  weekly_ai_cost_usd: "2.25",
  total_ai_cost_usd: "4.5",
  weekly_user_ai_cost_usd: "0.75",
  total_user_ai_cost_usd: "1.5",
  weekly_admin_ai_cost_usd: "0.75",
  total_admin_ai_cost_usd: "1.5",
  weekly_anonymous_ai_cost_usd: "0.75",
  total_anonymous_ai_cost_usd: "1.5",
  registered_user_count: "1",
  admin_user_count: "1",
  unpriced_usage_events: "2",
};
const ERROR_ROW = {
  latest_event_id: "42",
  error_code: "INVALID_EVALUATION_RESPONSE",
  weekly_count: "2",
  total_count: "4",
  last_occurred_at: new Date("2026-10-21T18:30:00.000Z"),
  latest_diagnostic_code: "decision_semantics",
};
const TREND_ROWS = [
  {
    week_start: "2026-08-31",
    registered_users_usd: "0",
    admins_usd: "0",
    anonymous_usd: "0",
    total_usd: "0",
  },
  {
    week_start: "2026-09-07",
    registered_users_usd: "0",
    admins_usd: "0",
    anonymous_usd: "0",
    total_usd: "0",
  },
  {
    week_start: "2026-09-14",
    registered_users_usd: "0",
    admins_usd: "0",
    anonymous_usd: "0",
    total_usd: "0",
  },
  {
    week_start: "2026-09-21",
    registered_users_usd: "0",
    admins_usd: "0",
    anonymous_usd: "0",
    total_usd: "0",
  },
  {
    week_start: "2026-09-28",
    registered_users_usd: "0",
    admins_usd: "0",
    anonymous_usd: "0",
    total_usd: "0",
  },
  {
    week_start: "2026-10-05",
    registered_users_usd: "0",
    admins_usd: "0",
    anonymous_usd: "0",
    total_usd: "0",
  },
  {
    week_start: "2026-10-12",
    registered_users_usd: "2",
    admins_usd: "3",
    anonymous_usd: "4",
    total_usd: "9",
  },
  {
    week_start: "2026-10-19",
    registered_users_usd: "0.75",
    admins_usd: "0.75",
    anonymous_usd: "0.75",
    total_usd: "2.25",
  },
];

describe("PostgresAdminDashboardRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records a safe validation diagnostic", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await repository.recordApplicationError(
      "INVALID_EVALUATION_RESPONSE",
      503,
      "decision_semantics",
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("context_json"),
      ["INVALID_EVALUATION_RESPONSE", 503, "decision_semantics", null],
    );
  });

  it("does not persist arbitrary diagnostic text", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await repository.recordApplicationError(
      "INVALID_EVALUATION_RESPONSE",
      503,
      "decision_semantics;idea text",
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("context_json"),
      ["INVALID_EVALUATION_RESPONSE", 503, null, null],
    );
  });

  it("stores only the supplied evaluation context for admin diagnostics", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);
    const context = {
      useCase: "idea_evaluation" as const,
      inputText: "Una app para ordenar cajas en un camión",
    };

    await repository.recordApplicationError(
      "INVALID_EVALUATION_RESPONSE",
      503,
      "decision_semantics",
      context,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("context_json"),
      [
        "INVALID_EVALUATION_RESPONSE",
        503,
        "decision_semantics",
        JSON.stringify(context),
      ],
    );
  });

  it.each([
    {
      errorCode: "HTTP_500",
      statusCode: 503,
      diagnosticCode: "decision_semantics",
    },
    {
      errorCode: "INVALID_EVALUATION_RESPONSE",
      statusCode: 500,
      diagnosticCode: "decision_semantics",
    },
    {
      errorCode: "INVALID_EVALUATION_RESPONSE",
      statusCode: 503,
      diagnosticCode: undefined,
    },
  ])(
    "does not persist idea context without a classified evaluation failure: %o",
    async ({ errorCode, statusCode, diagnosticCode }) => {
      const query = vi.fn().mockResolvedValue({ rowCount: 1 });
      const repository = new PostgresAdminDashboardRepository({
        query,
      } as unknown as Pool);

      await repository.recordApplicationError(
        errorCode,
        statusCode,
        diagnosticCode,
        { useCase: "idea_evaluation", inputText: "private idea" },
      );

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("context_json"),
        [errorCode, statusCode, diagnosticCode ?? null, null],
      );
    },
  );

  it("returns a single admin error event with its safe context", async () => {
    const occurredAt = new Date("2026-10-24T10:30:00.000Z");
    const context = {
      useCase: "idea_evaluation",
      inputText: "Una app para ordenar cajas en un camión",
    };
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "42",
          error_code: "INVALID_EVALUATION_RESPONSE",
          status_code: 503,
          occurred_at: occurredAt,
          diagnostic_code: "decision_semantics",
          context_json: context,
        },
      ],
    });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(repository.getApplicationError("42")).resolves.toEqual({
      id: "42",
      code: "INVALID_EVALUATION_RESPONSE",
      statusCode: 503,
      occurredAt: occurredAt.toISOString(),
      diagnosticCode: "decision_semantics",
      context,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("context_json"),
      ["42"],
    );
  });

  it("omits malformed stored context rather than returning it to the admin UI", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "42",
          error_code: "INVALID_EVALUATION_RESPONSE",
          status_code: 503,
          occurred_at: new Date("2026-10-24T10:30:00.000Z"),
          diagnostic_code: "decision_semantics",
          context_json: { useCase: "idea_evaluation", inputText: 42 },
        },
      ],
    });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(repository.getApplicationError("42")).resolves.toMatchObject({
      context: null,
    });
  });

  it("returns null when the requested error event no longer exists", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(repository.getApplicationError("42")).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "FROM application_error_events WHERE id=$1::bigint",
      ),
      ["42"],
    );
  });

  it("maps actor costs, account averages, and all eight weekly trend rows into the API snapshot", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [SUMMARY_ROW] })
      .mockResolvedValueOnce({ rows: [ERROR_ROW] })
      .mockResolvedValueOnce({ rows: TREND_ROWS });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(repository.getSnapshot()).resolves.toMatchObject({
      revenue: { weeklyEur: 4, totalEur: 8 },
      estimatedAiCost: {
        weeklyUsd: 2.25,
        totalUsd: 4.5,
        weeklyAveragePerAccountUsd: 0.75,
        totalAveragePerAccountUsd: 1.5,
        activeRegisteredAccountCount: 1,
        activeAdminAccountCount: 1,
        weeklyByActor: {
          registeredUsersUsd: 0.75,
          adminsUsd: 0.75,
          anonymousUsd: 0.75,
        },
        totalByActor: {
          registeredUsersUsd: 1.5,
          adminsUsd: 1.5,
          anonymousUsd: 1.5,
        },
        weeklyTrend: [
          expect.objectContaining({ weekStart: "2026-08-31", totalUsd: 0 }),
          expect.objectContaining({ weekStart: "2026-09-07", totalUsd: 0 }),
          expect.objectContaining({ weekStart: "2026-09-14", totalUsd: 0 }),
          expect.objectContaining({ weekStart: "2026-09-21", totalUsd: 0 }),
          expect.objectContaining({ weekStart: "2026-09-28", totalUsd: 0 }),
          expect.objectContaining({ weekStart: "2026-10-05", totalUsd: 0 }),
          expect.objectContaining({ weekStart: "2026-10-12", totalUsd: 9 }),
          expect.objectContaining({ weekStart: "2026-10-19", totalUsd: 2.25 }),
        ],
        unpricedUsageEvents: 2,
      },
      errors: [
        {
          latestEventId: "42",
          code: "INVALID_EVALUATION_RESPONSE",
          weeklyCount: 2,
          totalCount: 4,
          lastOccurredAt: "2026-10-21T18:30:00.000Z",
          latestDiagnosticCode: "decision_semantics",
        },
      ],
    });
    expect(query.mock.calls[1]?.[0]).toContain("max(occurred_at)");
    expect(query.mock.calls[1]?.[0]).toContain("diagnostic_code");
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("claims a reply atomically and obtains its recipient from the joined user row", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ contact_message_id: "message-id" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "message-id",
            subject: "Consulta",
            created_at: new Date("2026-10-18T12:00:00.000Z"),
            email: "owner@example.es",
            status: "sending",
            attempt_count: 1,
            last_attempt_at: new Date("2026-10-20T10:00:00.000Z"),
          },
        ],
      });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(
      repository.claimContactMessageReply("message-id", "admin-id", false),
    ).resolves.toMatchObject({
      recipient: "owner@example.es",
      subject: "Consulta",
      claimed: true,
      attemptCount: 1,
    });
    expect(query.mock.calls[0]?.[0]).toContain("FROM contact_messages contact");
    expect(query.mock.calls[0]?.[0]).toContain(
      "ON CONFLICT (contact_message_id) DO NOTHING",
    );
    expect(query.mock.calls[1]?.[0]).toContain("JOIN users user_account");
    expect(query.mock.calls[1]?.[0]).toContain("user_account.email");
  });

  it("does not retry an uncertain reply unless the admin has reviewed webmail", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "message-id",
            subject: "Consulta",
            created_at: new Date("2026-10-18T12:00:00.000Z"),
            email: "owner@example.es",
            status: "uncertain",
            attempt_count: 1,
            last_attempt_at: new Date("2026-10-20T10:00:00.000Z"),
          },
        ],
      });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    const claim = await repository.claimContactMessageReply(
      "message-id",
      "admin-id",
      false,
    );
    expect(claim).toMatchObject({ status: "uncertain", claimed: false });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain(
      "ON CONFLICT (contact_message_id) DO NOTHING",
    );
  });
});
