import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../infrastructure/database/run-migrations";
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
const MAXIMUM_COST_ROWS = [
  { operation: "idea_evaluation", average_usd: "0.004", priced_attempts: "5" },
  { operation: "roast", average_usd: "0.001", priced_attempts: "2" },
];
const ACTIVE_PLAN_ROWS = [
  { week_start: "2026-10-19", iluminado: "3", falton: "2" },
];
const ANNUAL_FINANCE_ROWS = [
  {
    month: "2026-01",
    revenue_eur: "0",
    ai_cost_usd: "0",
  },
  {
    month: "2026-10",
    revenue_eur: "5",
    ai_cost_usd: "1.25",
  },
];
const CONTACT_MESSAGE_ID = "message-id";
const CONTACT_CREATED_AT = new Date("2026-10-18T12:00:00.000Z");

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

  it("stores context for provider and timeout evaluation failures", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);
    const context = {
      useCase: "idea_evaluation" as const,
      inputText: "Una app para conectar un purificador de aire",
    };

    await repository.recordApplicationError(
      "EVALUATOR_UNAVAILABLE",
      503,
      "openai_http_429",
      context,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("context_json"),
      [
        "EVALUATOR_UNAVAILABLE",
        503,
        "openai_http_429",
        JSON.stringify(context),
      ],
    );
  });

  it("stores bounded evaluation context for any 5xx, even without a classified code", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);
    const context = {
      useCase: "idea_evaluation" as const,
      inputText: "private idea",
    };

    await repository.recordApplicationError(
      "HTTP_503",
      503,
      undefined,
      context,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("context_json"),
      ["HTTP_503", 503, null, JSON.stringify(context)],
    );
  });

  it("does not store evaluation context for client errors", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await repository.recordApplicationError("HTTP_400", 400, undefined, {
      useCase: "idea_evaluation",
      inputText: "private idea",
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("context_json"),
      ["HTTP_400", 400, null, null],
    );
  });

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
      .mockResolvedValueOnce({ rows: TREND_ROWS })
      .mockResolvedValueOnce({ rows: MAXIMUM_COST_ROWS })
      .mockResolvedValueOnce({ rows: ACTIVE_PLAN_ROWS })
      .mockResolvedValueOnce({ rows: ANNUAL_FINANCE_ROWS });
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
      maximumMonthlyCost: {
        iluminado: {
          averagePerAttemptUsd: 0.004,
          monthlyMaximumUsd: 1.32,
          pricedAttempts: 5,
        },
        falton: {
          averagePerAttemptUsd: 0.001,
          monthlyMaximumUsd: 0.33,
          pricedAttempts: 2,
        },
        dailyAttempts: 11,
        assumedDaysPerMonth: 30,
      },
      weeklyActivePlans: [{ weekStart: "2026-10-19", iluminado: 3, falton: 2 }],
      annualFinance: {
        year: 2026,
        hostingMonthlyEur: 12,
        hostingStartsMonth: "2026-10",
        usdToEurRate: 1 / 1.115,
        exchangeRateSource: "BCE",
        exchangeRateAsOf: "2026-10-27",
        months: [
          {
            month: "2026-01",
            revenueEur: 0,
            aiCostUsd: 0,
            aiCostEur: 0,
            hostingEur: 0,
            expensesEur: 0,
            netEur: 0,
          },
          {
            month: "2026-10",
            revenueEur: 5,
            aiCostUsd: 1.25,
            aiCostEur: 1.25 * (1 / 1.115),
            hostingEur: 12,
            expensesEur: 12 + 1.25 * (1 / 1.115),
            netEur: 5 - (12 + 1.25 * (1 / 1.115)),
          },
        ],
      },
    });
    expect(query.mock.calls[1]?.[0]).toContain("max(occurred_at)");
    expect(query.mock.calls[1]?.[0]).toContain("diagnostic_code");
    expect(query.mock.calls[3]?.[0]).toContain(
      "actor_type = 'registered_user'",
    );
    expect(query.mock.calls[3]?.[0]).toContain(
      "estimated_cost_usd IS NOT NULL",
    );
    expect(query.mock.calls[4]?.[0]).toContain(
      "count(DISTINCT subscription.user_id)",
    );
    expect(query.mock.calls[4]?.[0]).toContain("'expired'");
    expect(query.mock.calls[5]?.[0]).toContain("FROM simulated_purchases");
    expect(query.mock.calls[5]?.[0]).toContain("FROM admin_ai_usage_events");
    expect(query).toHaveBeenCalledTimes(6);
  });

  it("returns zero account averages and an empty error and trend list", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...SUMMARY_ROW,
            registered_user_count: "0",
            admin_user_count: "0",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(repository.getSnapshot()).resolves.toMatchObject({
      estimatedAiCost: {
        weeklyAveragePerAccountUsd: 0,
        totalAveragePerAccountUsd: 0,
        weeklyTrend: [],
      },
      errors: [],
      maximumMonthlyCost: {
        iluminado: {
          averagePerAttemptUsd: null,
          monthlyMaximumUsd: null,
          pricedAttempts: 0,
        },
        falton: {
          averagePerAttemptUsd: null,
          monthlyMaximumUsd: null,
          pricedAttempts: 0,
        },
      },
      weeklyActivePlans: [],
    });
  });

  it("throws when the dashboard summary query returns no row", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(repository.getSnapshot()).rejects.toThrow(
      "Admin dashboard summary unavailable.",
    );
  });

  it("lists contact messages with reply retry state and null timestamps", async () => {
    const attemptedAt = new Date("2026-10-20T10:00:00.000Z");
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "new-message",
          subject: "Sin respuesta",
          message: "Consulta inicial",
          created_at: CONTACT_CREATED_AT,
          username: "persona",
          email: "owner@example.es",
          reply_status: null,
          reply_attempt_count: null,
          reply_last_attempt_at: null,
        },
        {
          id: "retryable-message",
          subject: "Revisar respuesta",
          message: "¿Llegó mi correo?",
          created_at: CONTACT_CREATED_AT,
          username: "otra-persona",
          email: "other@example.es",
          reply_status: "uncertain",
          reply_attempt_count: 1,
          reply_last_attempt_at: attemptedAt,
        },
        {
          id: "exhausted-message",
          subject: "Sin más intentos",
          message: "Gracias",
          created_at: CONTACT_CREATED_AT,
          username: "tercera-persona",
          email: "third@example.es",
          reply_status: "uncertain",
          reply_attempt_count: 2,
          reply_last_attempt_at: attemptedAt,
        },
        {
          id: "sent-message",
          subject: "Enviado",
          message: "Recibido",
          created_at: CONTACT_CREATED_AT,
          username: "cuarta-persona",
          email: "fourth@example.es",
          reply_status: "sent",
          reply_attempt_count: 1,
          reply_last_attempt_at: attemptedAt,
        },
      ],
    });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(repository.listContactMessages()).resolves.toMatchObject([
      {
        id: "new-message",
        createdAt: CONTACT_CREATED_AT.toISOString(),
        sender: { username: "persona", email: "owner@example.es" },
        reply: {
          status: "not_replied",
          attemptedAt: null,
          retryAllowed: false,
        },
      },
      {
        id: "retryable-message",
        reply: {
          status: "uncertain",
          attemptedAt: attemptedAt.toISOString(),
          retryAllowed: true,
        },
      },
      {
        id: "exhausted-message",
        reply: { status: "uncertain", retryAllowed: false },
      },
      { id: "sent-message", reply: { status: "sent", retryAllowed: false } },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT $1"),
      [100],
    );
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

  it("claims an uncertain reply again only after webmail has been reviewed", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ contact_message_id: CONTACT_MESSAGE_ID }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: CONTACT_MESSAGE_ID,
            subject: "Consulta",
            created_at: CONTACT_CREATED_AT,
            email: "owner@example.es",
            status: "sending",
            attempt_count: 2,
            last_attempt_at: CONTACT_CREATED_AT,
          },
        ],
      });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(
      repository.claimContactMessageReply(CONTACT_MESSAGE_ID, "admin-id", true),
    ).resolves.toMatchObject({ claimed: true, attemptCount: 2 });
    expect(query.mock.calls[1]?.[0]).toContain("attempt_count < $3");
    expect(query.mock.calls[1]?.[1]).toEqual([
      CONTACT_MESSAGE_ID,
      "admin-id",
      2,
    ]);
  });

  it("returns null when a reply claim refers to a missing contact message", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await expect(
      repository.claimContactMessageReply(
        CONTACT_MESSAGE_ID,
        "admin-id",
        false,
      ),
    ).resolves.toBeNull();
  });

  it.each(["sent", "previewed", "uncertain"] as const)(
    "completes a reply with status %s",
    async (status) => {
      const query = vi.fn().mockResolvedValue({ rowCount: 1 });
      const repository = new PostgresAdminDashboardRepository({
        query,
      } as unknown as Pool);

      await repository.completeContactMessageReply(CONTACT_MESSAGE_ID, status);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("sent_at=CASE WHEN $2='sent'"),
        [CONTACT_MESSAGE_ID, status],
      );
    },
  );

  it.each([
    ["gpt-5.4-mini", 1000, 500, 0.003],
    ["unlisted-test-model", 1000, 500, null],
  ] as const)(
    "records AI usage and its estimated cost for model %s",
    async (model, inputTokens, outputTokens, expectedCost) => {
      const query = vi.fn().mockResolvedValue({ rowCount: 1 });
      const repository = new PostgresAdminDashboardRepository({
        query,
      } as unknown as Pool);

      await repository.recordAiUsage({
        userId: "admin-user-id",
        operation: "idea_evaluation",
        model,
        inputTokens,
        outputTokens,
      });

      expect(query).toHaveBeenCalledWith(expect.stringContaining("CASE"), [
        "admin-user-id",
        "idea_evaluation",
        model,
        inputTokens,
        outputTokens,
        expectedCost,
      ]);
    },
  );

  it("records unclassified application errors and ignores invalid HTTP status codes", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);

    await repository.recordApplicationError(
      "Bad error code with private data",
      599,
      "UPPERCASE_DIAGNOSTIC",
    );
    await repository.recordApplicationError("HTTP_400", 399);
    await repository.recordApplicationError("HTTP_400", 600);
    await repository.recordApplicationError("HTTP_400", 503.5);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO application_error_events"),
      ["UNCLASSIFIED_ERROR", 599, null, null],
    );
  });

  it("reuses the schema migration promise across repository operations", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const repository = new PostgresAdminDashboardRepository({
      query,
    } as unknown as Pool);
    await repository.completeContactMessageReply(CONTACT_MESSAGE_ID, "sent");
    await repository.recordApplicationError("HTTP_503", 503);

    expect(runMigrations).toHaveBeenCalledTimes(1);
  });
});
