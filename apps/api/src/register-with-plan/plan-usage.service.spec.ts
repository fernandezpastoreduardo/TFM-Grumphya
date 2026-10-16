import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PlanUsageRepository } from "./plan-usage.models";
import { PlanUsageService } from "./plan-usage.service";

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const IDEMPOTENCY_HASH = "a".repeat(64);
const REQUEST_HASH = "b".repeat(64);

function setup() {
  const repository = {
    reserve: vi.fn().mockResolvedValue({ state: "reserved" }),
    commit: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  } satisfies PlanUsageRepository & {
    reserve: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  return { service: new PlanUsageService(repository), repository };
}

describe("PlanUsageService", () => {
  it("reserves, commits and releases the selected authenticated scope", async () => {
    const { service, repository } = setup();

    await expect(
      service.reserve(USER_ID, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual({ state: "reserved" });
    await service.commit(
      USER_ID,
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
      { status: "evaluated" },
    );
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
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it.each([
    ["ACTIVE_PLAN_REQUIRED", 403],
    ["PLAN_QUOTA_EXHAUSTED", 429],
  ])("maps repository error %s to HTTP %s", async (error, status) => {
    const { service, repository } = setup();
    repository.reserve.mockRejectedValue(new Error(error));

    await expect(
      service.reserve(USER_ID, "roasts", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code:
          error === "ACTIVE_PLAN_REQUIRED"
            ? "ACTIVE_PLAN_REQUIRED"
            : "PLAN_QUOTA_EXHAUSTED",
      }),
      status,
    });
  });
});
