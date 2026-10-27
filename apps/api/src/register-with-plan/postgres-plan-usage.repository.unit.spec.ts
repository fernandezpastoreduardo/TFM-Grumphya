import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { PostgresPlanUsageRepository } from "./postgres-plan-usage.repository";

vi.mock("../infrastructure/database/run-migrations", () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const IDEMPOTENCY_HASH = "a".repeat(64);
const REQUEST_HASH = "b".repeat(64);
const USAGE_DATE = "2026-10-27";

type QueryResult = { rows: unknown[]; rowCount: number };

function result(rows: unknown[] = [], rowCount = rows.length): QueryResult {
  return { rows, rowCount };
}

function createRepository(
  clientResults: QueryResult[],
  poolResults: QueryResult[] = [],
) {
  const client = {
    query: vi.fn(async () => clientResults.shift() ?? result()),
    release: vi.fn(),
  } as unknown as PoolClient;
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(async () => poolResults.shift() ?? result()),
    end: vi.fn().mockResolvedValue(undefined),
  } as unknown as Pool;
  return {
    client,
    pool,
    repository: new PostgresPlanUsageRepository(pool),
  };
}

function reserveResults(options?: {
  usageLimit?: number;
  role?: string;
  username?: string;
  used?: number;
  prior?: unknown;
  freshness?: boolean;
  otherReservations?: number;
  usageDate?: string;
}): QueryResult[] {
  const settings = options ?? {};
  return [
    result(),
    result(),
    result([
      {
        usage_limit: settings.usageLimit ?? 11,
        role: settings.role ?? "user",
        username_normalized: settings.username ?? "persona",
      },
    ]),
    result(
      settings.usageDate
        ? [{ usage_date: settings.usageDate }]
        : [{ usage_date: USAGE_DATE }],
    ),
    result(),
    result([{ used: settings.used ?? 0 }]),
    result(settings.prior ? [settings.prior] : []),
    ...(settings.prior &&
    (settings.prior as { state?: string }).state === "reserved"
      ? [result([{ fresh: settings.freshness ?? false }])]
      : []),
    result([{ count: settings.otherReservations ?? 0 }]),
    result(),
  ];
}

afterEach(() => vi.clearAllMocks());

describe("PostgresPlanUsageRepository", () => {
  it("reserves an available plan attempt and commits the transaction", async () => {
    const { client, repository } = createRepository(reserveResults());

    await expect(
      repository.reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual({ state: "reserved" });

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO account_plan_usage_requests"),
      [USER_ID, "ILUMINADO", USAGE_DATE, IDEMPOTENCY_HASH, REQUEST_HASH],
    );
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("allows Jappy to reserve without an active plan or daily usage row", async () => {
    const { client, repository } = createRepository(
      reserveResults({ usageLimit: 0, role: "admin", username: "jappy" }),
    );

    await expect(
      repository.reserve(USER_ID, "roasts", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual({ state: "reserved" });

    const sql = vi
      .mocked(client.query)
      .mock.calls.map(([statement]) => statement);
    expect(
      sql.some((statement) =>
        String(statement).includes("account_daily_plan_usage"),
      ),
    ).toBe(false);
    expect(
      sql.some((statement) => String(statement).includes("SELECT roasts_used")),
    ).toBe(false);
  });

  it("rejects accounts without the matching active plan and rolls back", async () => {
    const { client, repository } = createRepository([
      result(),
      result(),
      result([
        { usage_limit: 0, role: "user", username_normalized: "persona" },
      ]),
    ]);

    await expect(
      repository.reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toThrow("ACTIVE_PLAN_REQUIRED");

    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects when the database cannot provide Madrid's usage date", async () => {
    const responses = reserveResults().slice(0, 4);
    responses[3] = result();
    const { repository } = createRepository(responses);

    await expect(
      repository.reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toThrow("PLAN_USAGE_DATE_UNAVAILABLE");
  });

  it("returns a cached response for a committed idempotent request", async () => {
    const cachedResponse = { score: 7.25 };
    const { client, repository } = createRepository(
      reserveResults({
        prior: {
          request_hash: REQUEST_HASH,
          state: "committed",
          response_json: cachedResponse,
        },
      }).slice(0, 7),
    );

    await expect(
      repository.reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual({ state: "cached", response: cachedResponse });
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("rejects a reused idempotency key with a different request hash", async () => {
    const { repository } = createRepository(
      reserveResults({
        prior: {
          request_hash: "c".repeat(64),
          state: "committed",
          response_json: { score: 1 },
        },
      }).slice(0, 7),
    );

    await expect(
      repository.reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("rejects a fresh duplicate reservation and permits an expired one to be reclaimed", async () => {
    const fresh = createRepository(
      reserveResults({
        prior: {
          request_hash: REQUEST_HASH,
          state: "reserved",
          response_json: null,
        },
        freshness: true,
      }).slice(0, 8),
    );
    await expect(
      fresh.repository.reserve(
        USER_ID,
        "ideas",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).rejects.toThrow("REQUEST_IN_PROGRESS");

    const stale = createRepository(
      reserveResults({
        prior: {
          request_hash: REQUEST_HASH,
          state: "reserved",
          response_json: null,
        },
        freshness: false,
      }),
    );
    await expect(
      stale.repository.reserve(
        USER_ID,
        "ideas",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).resolves.toEqual({ state: "reserved" });
    expect(stale.client.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("counts concurrent reservations against the daily quota", async () => {
    const { repository } = createRepository(
      reserveResults({ usageLimit: 1, otherReservations: 1 }).slice(0, 9),
    );

    await expect(
      repository.reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toThrow("PLAN_QUOTA_EXHAUSTED");
  });

  it("commits an idea reservation and increments its plan counter", async () => {
    const { client, repository } = createRepository([
      result(),
      result([
        {
          role: "user",
          username_normalized: "persona",
          has_active_plan: true,
        },
      ]),
      result([{ usage_date: USAGE_DATE }]),
      result([], 1),
      result([], 1),
    ]);

    await expect(
      repository.commit(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH, {
        score: 6,
      }),
    ).resolves.toBeUndefined();

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("ideas_used=ideas_used+1"),
      [USER_ID, "ILUMINADO", USAGE_DATE],
    );
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("commits a roast reservation against FALTON and records its historical event", async () => {
    const { client, repository } = createRepository([
      result(),
      result([
        {
          role: "user",
          username_normalized: "persona",
          has_active_plan: true,
        },
      ]),
      result([{ usage_date: USAGE_DATE }]),
      result([], 1),
      result([], 1),
      result([], 1),
      result([], 1),
    ]);

    await repository.commit(USER_ID, "roasts", IDEMPOTENCY_HASH, REQUEST_HASH, {
      reply: "Respuesta",
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("roasts_used=roasts_used+1"),
      [USER_ID, "FALTON", USAGE_DATE],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO account_roast_message_events"),
      [USER_ID, IDEMPOTENCY_HASH, "jappy"],
    );
    expect(client.query).toHaveBeenCalledWith(
      "UPDATE users SET roast_messages_sent=roast_messages_sent+1 WHERE id=$1",
      [USER_ID],
    );
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("rejects commit after the active plan is gone", async () => {
    const { client, repository } = createRepository([result([])]);

    await expect(
      repository.commit(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH, {}),
    ).rejects.toThrow("ACTIVE_PLAN_REQUIRED");
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it("rolls back when the reservation has already expired or is missing", async () => {
    const { repository } = createRepository([
      result(),
      result([
        {
          role: "user",
          username_normalized: "persona",
          has_active_plan: true,
        },
      ]),
      result([]),
    ]);

    await expect(
      repository.commit(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH, {}),
    ).rejects.toThrow("PLAN_USAGE_RESERVATION_UNAVAILABLE");
  });

  it("does not exceed the quota when committing the reserved attempt", async () => {
    const { client, repository } = createRepository([
      result(),
      result([
        {
          role: "user",
          username_normalized: "persona",
          has_active_plan: true,
        },
      ]),
      result([{ usage_date: USAGE_DATE }], 1),
      result([], 0),
    ]);

    await expect(
      repository.commit(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH, {}),
    ).rejects.toThrow("PLAN_QUOTA_EXHAUSTED");
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it("records Jappy's roast count without touching plan quota counters", async () => {
    const { client, repository } = createRepository([
      result(),
      result([
        {
          role: "admin",
          username_normalized: "jappy",
          has_active_plan: false,
        },
      ]),
      result([{ usage_date: USAGE_DATE }]),
      result([], 1),
      result([], 1),
      result([], 1),
    ]);

    await repository.commit(USER_ID, "roasts", IDEMPOTENCY_HASH, REQUEST_HASH, {
      reply: "Listo",
    });

    const statements = vi
      .mocked(client.query)
      .mock.calls.map(([statement]) => String(statement));
    expect(
      statements.some((statement) =>
        statement.includes("roasts_used=roasts_used+1"),
      ),
    ).toBe(false);
    expect(
      statements.some((statement) =>
        statement.includes("account_roast_message_events"),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes("roast_messages_sent=roast_messages_sent+1"),
      ),
    ).toBe(true);
  });

  it("records roast events only once and closes both persistence paths cleanly", async () => {
    const duplicate = createRepository([result(), result([], 0)]);
    await duplicate.repository.recordHistoricalRoastMessage(
      USER_ID,
      IDEMPOTENCY_HASH,
    );
    expect(duplicate.client.query).not.toHaveBeenCalledWith(
      expect.stringContaining("roast_messages_sent=roast_messages_sent+1"),
    );

    await duplicate.repository.release(USER_ID, "roasts", IDEMPOTENCY_HASH);
    expect(duplicate.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("state='released'"),
      [USER_ID, "FALTON", IDEMPOTENCY_HASH],
    );
    await duplicate.repository.close();
    expect(duplicate.pool.end).toHaveBeenCalledOnce();
  });
});
