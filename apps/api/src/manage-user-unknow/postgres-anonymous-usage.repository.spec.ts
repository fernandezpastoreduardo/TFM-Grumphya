import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  AnonymousIpLimitError,
  PostgresAnonymousUsageRepository,
  hashAnonymousIp,
} from "./postgres-anonymous-usage.repository";

const TOKEN_HASH = "visitor-token-hash";
const IP_HMAC = "visitor-ip-hmac";
const VISITOR_ID = "visitor-id";
const IDEMPOTENCY_HASH = "idempotency-hash";
const REQUEST_HASH = "request-hash";

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

function createRepository(
  clientResults: QueryResult[] = [],
  poolResults: QueryResult[] = [],
) {
  const clientQuery = vi.fn();
  for (const result of clientResults) {
    clientQuery.mockResolvedValueOnce(result);
  }
  const poolQuery = vi.fn();
  for (const result of poolResults) {
    poolQuery.mockResolvedValueOnce(result);
  }
  const release = vi.fn();
  const client = { query: clientQuery, release };
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: poolQuery,
  };
  const migrationRunner = vi.fn().mockResolvedValue(undefined);
  return {
    repository: new PostgresAnonymousUsageRepository(
      pool as unknown as Pick<Pool, "query" | "connect">,
      migrationRunner,
    ),
    clientQuery,
    poolQuery,
    migrationRunner,
    release,
  };
}

describe("PostgresAnonymousUsageRepository", () => {
  it("creates a visitor and initializes its IP activity transactionally", async () => {
    const { repository, clientQuery, release, migrationRunner } =
      createRepository([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        {
          rows: [{ profiles_created: 1, retry_after_seconds: 3600 }],
          rowCount: 1,
        },
        { rows: [], rowCount: 1 },
        { rows: [], rowCount: 0 },
      ]);

    await expect(repository.initialize(TOKEN_HASH, IP_HMAC)).resolves.toBe(
      true,
    );

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO anonymous_visitors"),
      [TOKEN_HASH],
    );
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(migrationRunner).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("updates last-seen for an existing visitor without charging the IP limit", async () => {
    const { repository, clientQuery, release } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: VISITOR_ID }], rowCount: 1 },
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(repository.initialize(TOKEN_HASH, IP_HMAC)).resolves.toBe(
      false,
    );

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        "UPDATE anonymous_visitors SET last_seen_at = now()",
      ),
      [VISITOR_ID],
    );
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO anonymous_ip_activity"),
      ),
    ).toBe(false);
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back visitor creation when the IP profile limit is exceeded", async () => {
    const { repository, clientQuery, release } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      {
        rows: [{ profiles_created: 21, retry_after_seconds: "240" }],
        rowCount: 1,
      },
      { rows: [], rowCount: 0 },
    ]);

    const error = await repository
      .initialize(TOKEN_HASH, IP_HMAC)
      .catch((caught: unknown) => caught);

    if (!(error instanceof AnonymousIpLimitError)) {
      throw new Error("Expected anonymous IP profile limit to be enforced.");
    }
    expect(error.retryAfterSeconds).toBe(240);
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns separate quota counters and null for an unknown visitor", async () => {
    const { repository, poolQuery } = createRepository(
      [],
      [
        { rows: [{ id: VISITOR_ID }], rowCount: 1 },
        {
          rows: [
            { scope: "ideas", used_count: 2, reserved_count: 1 },
            { scope: "roasts", used_count: 1, reserved_count: 0 },
          ],
          rowCount: 2,
        },
        { rows: [], rowCount: 0 },
      ],
    );

    await expect(repository.getUsage(TOKEN_HASH)).resolves.toEqual({
      ideas: { limit: 3, used: 3, remaining: 0 },
      roasts: { limit: 3, used: 1, remaining: 2 },
    });
    await expect(repository.getUsage("missing-token-hash")).resolves.toBe(null);
    expect(poolQuery).toHaveBeenCalledTimes(3);
  });

  it("reserves a new request and reports its outstanding use", async () => {
    const { repository, clientQuery, release } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: VISITOR_ID }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      {
        rows: [{ scope: "ideas", used_count: 0, reserved_count: 0 }],
        rowCount: 1,
      },
      { rows: [], rowCount: 1 },
      {
        rows: [{ scope: "ideas", used_count: 0, reserved_count: 1 }],
        rowCount: 1,
      },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.reserve(TOKEN_HASH, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual({
      state: "reserved",
      usage: {
        ideas: { limit: 3, used: 1, remaining: 2 },
        roasts: { limit: 3, used: 0, remaining: 3 },
      },
    });
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO anonymous_usage_requests"),
      [VISITOR_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH],
    );
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns the cached response without reserving a second use", async () => {
    const cachedResponse = { status: "evaluated" };
    const { repository, clientQuery, release } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: VISITOR_ID }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      {
        rows: [
          {
            request_hash: REQUEST_HASH,
            state: "committed",
            response_json: cachedResponse,
          },
        ],
        rowCount: 1,
      },
      {
        rows: [{ scope: "ideas", used_count: 1, reserved_count: 0 }],
        rowCount: 1,
      },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.reserve(TOKEN_HASH, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual({
      state: "cached",
      response: cachedResponse,
      usage: {
        ideas: { limit: 3, used: 1, remaining: 2 },
        roasts: { limit: 3, used: 0, remaining: 3 },
      },
    });
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("reserved_count = reserved_count + 1"),
      ),
    ).toBe(false);
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "a changed request payload",
      "different-request-hash",
      "reserved",
      "IDEMPOTENCY_CONFLICT",
    ],
    [
      "an already running request",
      REQUEST_HASH,
      "reserved",
      "REQUEST_IN_PROGRESS",
    ],
  ])(
    "rejects %s and rolls its reservation transaction back",
    async (_label, requestHash, state, message) => {
      const { repository, clientQuery, release } = createRepository([
        { rows: [], rowCount: 0 },
        { rows: [], rowCount: 0 },
        { rows: [{ id: VISITOR_ID }], rowCount: 1 },
        { rows: [], rowCount: 0 },
        {
          rows: [{ request_hash: requestHash, state, response_json: null }],
          rowCount: 1,
        },
        { rows: [], rowCount: 0 },
      ]);

      await expect(
        repository.reserve(TOKEN_HASH, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
      ).rejects.toThrow(message);
      expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
      expect(release).toHaveBeenCalledOnce();
    },
  );

  it("rejects reservations after the lifetime quota is consumed", async () => {
    const { repository, clientQuery, release } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [{ id: VISITOR_ID }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 1 },
      {
        rows: [{ scope: "ideas", used_count: 3, reserved_count: 0 }],
        rowCount: 1,
      },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.reserve(TOKEN_HASH, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toThrow("ANONYMOUS_QUOTA_EXHAUSTED");
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("commits a reserved response and moves its count from reserved to used", async () => {
    const response = { status: "evaluated" };
    const { repository, clientQuery, release } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [{ id: VISITOR_ID }], rowCount: 1 },
      { rows: [{ idempotency_hash: IDEMPOTENCY_HASH }], rowCount: 1 },
      { rows: [{ visitor_id: VISITOR_ID }], rowCount: 1 },
      {
        rows: [{ scope: "ideas", used_count: 1, reserved_count: 0 }],
        rowCount: 1,
      },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.commit(
        TOKEN_HASH,
        "ideas",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
        response,
      ),
    ).resolves.toEqual({
      ideas: { limit: 3, used: 1, remaining: 2 },
      roasts: { limit: 3, used: 0, remaining: 3 },
    });
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("state = 'committed'"),
      [
        VISITOR_ID,
        "ideas",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
        JSON.stringify(response),
      ],
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("reserved_count = reserved_count - 1"),
      [VISITOR_ID, "ideas"],
    );
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it.each([
    ["the reservation is missing", 0, 1, "USAGE_RESERVATION_UNAVAILABLE"],
    ["the reserved counter is missing", 1, 0, "USAGE_COUNTER_UNAVAILABLE"],
  ])(
    "rolls a commit back when %s",
    async (_label, reservationRowCount, counterRowCount, message) => {
      const results = [
        { rows: [], rowCount: 0 },
        { rows: [{ id: VISITOR_ID }], rowCount: 1 },
        { rows: [], rowCount: reservationRowCount },
        { rows: [], rowCount: counterRowCount },
        { rows: [], rowCount: 0 },
      ];
      const { repository, clientQuery, release } = createRepository(results);

      await expect(
        repository.commit(TOKEN_HASH, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH, {
          status: "evaluated",
        }),
      ).rejects.toThrow(message);
      expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
      expect(release).toHaveBeenCalledOnce();
    },
  );

  it("releases a failed reservation and only decrements its reserved counter", async () => {
    const { repository, clientQuery, release } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [{ id: VISITOR_ID }], rowCount: 1 },
      { rows: [{ visitor_id: VISITOR_ID }], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);

    await repository.release(TOKEN_HASH, "ideas", IDEMPOTENCY_HASH);

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET state = 'released'"),
      [VISITOR_ID, "ideas", IDEMPOTENCY_HASH],
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("GREATEST(0, reserved_count - 1)"),
      [VISITOR_ID, "ideas"],
    );
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("leaves quota counters unchanged when no reservation can be released", async () => {
    const { repository, clientQuery } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [{ id: VISITOR_ID }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
    ]);

    await repository.release(TOKEN_HASH, "ideas", IDEMPOTENCY_HASH);

    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("reserved_count - 1"),
      ),
    ).toBe(false);
    expect(clientQuery).toHaveBeenLastCalledWith("COMMIT");
  });

  it("rejects anonymous requests without a known browser profile", async () => {
    const { repository, clientQuery, release } = createRepository([
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 },
    ]);

    await expect(
      repository.reserve(TOKEN_HASH, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toThrow("ANONYMOUS_VISITOR_NOT_FOUND");
    expect(clientQuery).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("hashes IP addresses with an HMAC secret and rejects blank secrets", () => {
    const firstHash = hashAnonymousIp("203.0.113.20", "test-secret");

    expect(firstHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashAnonymousIp("203.0.113.20", "test-secret")).toBe(firstHash);
    expect(hashAnonymousIp("203.0.113.20", "other-secret")).not.toBe(firstHash);
    expect(() => hashAnonymousIp("203.0.113.20", "  ")).toThrow(
      "ANONYMOUS_IP_HMAC_SECRET must be configured.",
    );
  });
});
