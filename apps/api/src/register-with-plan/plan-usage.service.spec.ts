import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PlanUsageRepository } from "./plan-usage.models";
import { PlanUsageService } from "./plan-usage.service";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const IDEMPOTENCY_HASH = "a".repeat(64);
const REQUEST_HASH = "b".repeat(64);
const RESERVATION = { state: "reserved" as const };
const PRIVATE_RESPONSE = { status: "RECHAZADA", score: 3.2 };

function setup() {
  const repository = {
    reserve: vi.fn().mockResolvedValue(RESERVATION),
    commit: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    recordHistoricalRoastMessage: vi.fn().mockResolvedValue(undefined),
  } satisfies PlanUsageRepository & {
    reserve: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
    recordHistoricalRoastMessage: ReturnType<typeof vi.fn>;
  };
  return { service: new PlanUsageService(repository), repository };
}

describe("PlanUsageService", () => {
  it("reserves, commits and releases the selected authenticated scope", async () => {
    const { service, repository } = setup();

    await expect(
      service.reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual(RESERVATION);
    await service.commit(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH, {
      status: "evaluated",
    });
    await service.release(USER_ID, "ideas", IDEMPOTENCY_HASH);

    expect(repository.reserve).toHaveBeenCalledWith(
      USER_ID,
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );
    expect(repository.commit).toHaveBeenCalledWith(
      USER_ID,
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
      { status: "evaluated" },
    );
    expect(repository.release).toHaveBeenCalledWith(
      USER_ID,
      "ideas",
      IDEMPOTENCY_HASH,
    );
  });

  it("rejects malformed identifiers and idempotency hashes before persistence", async () => {
    const { service, repository } = setup();

    await expect(
      service.reserve("not-a-uuid", "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.reserve(USER_ID, "ideas", "bad-hash", REQUEST_HASH),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.recordHistoricalRoastMessage("not-a-uuid", IDEMPOTENCY_HASH),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.recordHistoricalRoastMessage(USER_ID, "bad-hash"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.reserve).not.toHaveBeenCalled();
    expect(repository.recordHistoricalRoastMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid request hash", USER_ID, "ideas", IDEMPOTENCY_HASH, "bad-hash"],
    [
      "unsupported UUID version",
      "123e4567-e89b-02d3-a456-426614174000",
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    ],
    [
      "unsupported UUID variant",
      "123e4567-e89b-42d3-7456-426614174000",
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    ],
  ] as const)(
    "rejects an %s before persistence",
    async (_case, userId, scope, idempotencyHash, requestHash) => {
      const { service, repository } = setup();

      await expect(
        service.reserve(userId, scope, idempotencyHash, requestHash),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "INVALID_IDEMPOTENCY_KEY" },
      });
      expect(repository.reserve).not.toHaveBeenCalled();
    },
  );

  it("rejects a scope outside the supported set before persistence", async () => {
    const { service, repository } = setup();

    await expect(
      Reflect.apply(service.reserve, service, [
        USER_ID,
        "reviews",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ]),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "INVALID_IDEMPOTENCY_KEY" },
    });
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it("records a historical Faltón roast through idempotent persistence", async () => {
    const { service, repository } = setup();

    await service.recordHistoricalRoastMessage(USER_ID, IDEMPOTENCY_HASH);

    expect(repository.recordHistoricalRoastMessage).toHaveBeenCalledWith(
      USER_ID,
      IDEMPOTENCY_HASH,
    );
  });

  it.each([
    ["ACTIVE_PLAN_REQUIRED", 403, "ACTIVE_PLAN_REQUIRED"],
    ["PLAN_QUOTA_EXHAUSTED", 429, "PLAN_QUOTA_EXHAUSTED"],
    ["IDEMPOTENCY_CONFLICT", 409, "IDEMPOTENCY_CONFLICT"],
    ["REQUEST_IN_PROGRESS", 409, "REQUEST_IN_PROGRESS"],
  ])("maps repository error %s to HTTP %s", async (error, status, code) => {
    const { service, repository } = setup();
    repository.reserve.mockRejectedValue(new Error(error));

    await expect(
      service.reserve(USER_ID, "roasts", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
      status,
    });
  });

  it("maps an unexpected reservation error to a generic 503", async () => {
    const { service, repository } = setup();
    repository.reserve.mockRejectedValue(new Error("database details"));

    const reservationError = await service
      .reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH)
      .catch((error: unknown) => error);

    expect(reservationError).toMatchObject({
      status: 503,
      response: { code: "PLAN_USAGE_UNAVAILABLE" },
    });
    expect(JSON.stringify(reservationError)).not.toContain("database details");
  });

  it("returns no plan reservation when the account does not have this scope active", async () => {
    const { service, repository } = setup();
    repository.reserve.mockRejectedValue(new Error("ACTIVE_PLAN_REQUIRED"));

    await expect(
      service.reserveIfPlanActive(
        USER_ID,
        "roasts",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).resolves.toBeNull();
  });

  it("returns an active plan reservation unchanged", async () => {
    const { service, repository } = setup();
    const cachedReservation = {
      state: "cached" as const,
      response: PRIVATE_RESPONSE,
      usage: { ideas: { limit: 11, used: 1, remaining: 10 } },
    };
    repository.reserve.mockResolvedValue(cachedReservation);

    await expect(
      service.reserveIfPlanActive(
        USER_ID,
        "ideas",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).resolves.toBe(cachedReservation);
  });

  it("keeps quota and infrastructure errors instead of treating them as free usage", async () => {
    const { service, repository } = setup();
    repository.reserve.mockRejectedValue(new Error("PLAN_QUOTA_EXHAUSTED"));

    await expect(
      service.reserveIfPlanActive(
        USER_ID,
        "roasts",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "PLAN_QUOTA_EXHAUSTED" }),
    });
  });

  it.each([
    ["ACTIVE_PLAN_REQUIRED", 403, "ACTIVE_PLAN_REQUIRED"],
    ["PLAN_QUOTA_EXHAUSTED", 429, "PLAN_QUOTA_EXHAUSTED"],
    ["database details", 503, "PLAN_USAGE_UNAVAILABLE"],
  ])(
    "maps commit error %s to a generic response",
    async (error, status, code) => {
      const { service, repository } = setup();
      repository.commit.mockRejectedValue(new Error(error));

      const commitError = await service
        .commit(
          USER_ID,
          "roasts",
          IDEMPOTENCY_HASH,
          REQUEST_HASH,
          PRIVATE_RESPONSE,
        )
        .catch((error: unknown) => error);

      expect(commitError).toMatchObject({
        status,
        response: { code },
      });
      if (status === 503) {
        expect(JSON.stringify(commitError)).not.toContain("database details");
      }
    },
  );

  it("maps release failures to a generic 503", async () => {
    const { service, repository } = setup();
    repository.release.mockRejectedValue(new Error("database details"));

    await expect(
      service.release(USER_ID, "ideas", IDEMPOTENCY_HASH),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: "PLAN_USAGE_UNAVAILABLE" },
    });
  });

  it("maps historical roast persistence failures to a generic 503", async () => {
    const { service, repository } = setup();
    repository.recordHistoricalRoastMessage.mockRejectedValue(
      new Error("database details"),
    );

    await expect(
      service.recordHistoricalRoastMessage(USER_ID, IDEMPOTENCY_HASH),
    ).rejects.toMatchObject({
      status: 503,
      response: { code: "PLAN_USAGE_UNAVAILABLE" },
    });
  });
});
