import { UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AnonymousUsageRepository } from "./anonymous-usage.models";
import { AnonymousUsageService } from "./anonymous-usage.service";
import { AnonymousIpLimitError } from "./postgres-anonymous-usage.repository";

const IP_HMAC_SECRET = "test-only-anonymous-ip-key";
const COOKIE_TOKEN = "a".repeat(43);
const CLIENT_IP = "192.0.2.15";
const IDEMPOTENCY_HASH = "b".repeat(64);
const REQUEST_HASH = "c".repeat(64);
const RESPONSE_BODY = { status: "RECHAZADA", score: 2.5 };
const UNUSED_STATE = {
  ideas: { limit: 3 as const, used: 0, remaining: 3 },
  roasts: { limit: 3 as const, used: 0, remaining: 3 },
};

function createRepository() {
  return {
    initialize: vi.fn().mockResolvedValue(true),
    getUsage: vi.fn().mockResolvedValue(UNUSED_STATE),
    reserve: vi
      .fn()
      .mockResolvedValue({ state: "reserved", usage: UNUSED_STATE }),
    commit: vi.fn().mockResolvedValue(UNUSED_STATE),
    release: vi.fn().mockResolvedValue(undefined),
  } as unknown as AnonymousUsageRepository & {
    initialize: ReturnType<typeof vi.fn>;
    getUsage: ReturnType<typeof vi.fn>;
    reserve: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
}

describe("AnonymousUsageService", () => {
  it("creates an opaque browser identity and stores only token and IP HMACs", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    const result = await service.initialize(undefined, CLIENT_IP);

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(repository.initialize).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      createHmac("sha256", IP_HMAC_SECRET).update(CLIENT_IP).digest("hex"),
    );
    expect(result.usage).toEqual(UNUSED_STATE);
  });

  it("reuses a valid persistent token without issuing a new visitor", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    const result = await service.initialize(COOKIE_TOKEN, CLIENT_IP);

    expect(result.token).toBe(COOKIE_TOKEN);
    expect(repository.initialize).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.any(String),
    );
  });

  it("returns a temporary rate limit when one IP creates too many profiles", async () => {
    const repository = createRepository();
    repository.initialize.mockRejectedValue(new AnonymousIpLimitError(86_400));
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(
      service.initialize(undefined, CLIENT_IP),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: "ANONYMOUS_PROFILE_RATE_LIMITED" },
    });
  });

  it("requires a persisted anonymous visitor before returning quotas", async () => {
    const repository = createRepository();
    repository.getUsage.mockResolvedValue(null);
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(service.getUsage(COOKIE_TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects malformed visitor tokens without querying the repository", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(service.getUsage("invalid-token")).rejects.toMatchObject({
      status: 401,
      response: { code: "ANONYMOUS_PROFILE_REQUIRED" },
    });
    expect(repository.getUsage).not.toHaveBeenCalled();
  });

  it("fails initialization when the newly created profile cannot be read", async () => {
    const repository = createRepository();
    repository.getUsage.mockResolvedValue(null);
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(
      service.initialize(undefined, CLIENT_IP),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: "ANONYMOUS_PROFILE_UNAVAILABLE" },
    });
  });

  it("maps exhausted lifetime quota to a stable 429 code and scope", async () => {
    const repository = createRepository();
    repository.getUsage.mockResolvedValue({
      ...UNUSED_STATE,
      ideas: { limit: 3, used: 3, remaining: 0 },
    });
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(
      service.assertAvailable(COOKIE_TOKEN, "ideas"),
    ).rejects.toMatchObject({
      status: 429,
      response: {
        code: "ANONYMOUS_QUOTA_EXHAUSTED",
        scope: "ideas",
        remaining: 0,
      },
    });
  });

  it("allows an available quota without changing the persisted usage", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(service.assertAvailable(COOKIE_TOKEN, "ideas")).resolves.toBe(
      undefined,
    );
    expect(repository.getUsage).toHaveBeenCalledOnce();
  });

  it("reserves usage with hashed browser identity and idempotency values", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(
      service.reserve(COOKIE_TOKEN, "roasts", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).resolves.toEqual({ state: "reserved", usage: UNUSED_STATE });

    expect(repository.reserve).toHaveBeenCalledWith(
      createHash("sha256").update(COOKIE_TOKEN).digest("hex"),
      "roasts",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );
  });

  it.each([
    ["invalid idempotency hash", "invalid", REQUEST_HASH],
    ["invalid request hash", IDEMPOTENCY_HASH, "invalid"],
  ])(
    "rejects an %s before reserving quota",
    async (_label, idempotencyHash, requestHash) => {
      const repository = createRepository();
      const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

      await expect(
        service.reserve(COOKIE_TOKEN, "ideas", idempotencyHash, requestHash),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: "INVALID_IDEMPOTENCY_KEY" },
      });
      expect(repository.reserve).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["ANONYMOUS_QUOTA_EXHAUSTED", 429],
    ["IDEMPOTENCY_CONFLICT", 409],
    ["REQUEST_IN_PROGRESS", 409],
  ])(
    "maps reservation error %s to its public status",
    async (errorCode, status) => {
      const repository = createRepository();
      repository.reserve.mockRejectedValueOnce(new Error(errorCode));
      const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

      await expect(
        service.reserve(COOKIE_TOKEN, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
      ).rejects.toMatchObject({ status });
    },
  );

  it("propagates reservation errors that have no public mapping", async () => {
    const repository = createRepository();
    const databaseError = new Error("database unavailable");
    repository.reserve.mockRejectedValueOnce(databaseError);
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(
      service.reserve(COOKIE_TOKEN, "ideas", IDEMPOTENCY_HASH, REQUEST_HASH),
    ).rejects.toBe(databaseError);
  });

  it("commits a successful response to the existing reservation", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(
      service.commit(
        COOKIE_TOKEN,
        "ideas",
        IDEMPOTENCY_HASH,
        REQUEST_HASH,
        RESPONSE_BODY,
      ),
    ).resolves.toEqual(UNUSED_STATE);

    expect(repository.commit).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
      RESPONSE_BODY,
    );
  });

  it("releases a failed reservation without consuming quota", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, IP_HMAC_SECRET);

    await expect(
      service.release(COOKIE_TOKEN, "ideas", IDEMPOTENCY_HASH),
    ).resolves.toBeUndefined();

    expect(repository.release).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      "ideas",
      IDEMPOTENCY_HASH,
    );
  });

  it("fails closed when the IP HMAC secret is missing", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, " ");

    await expect(service.initialize(undefined, CLIENT_IP)).rejects.toThrow(
      "ANONYMOUS_IP_HMAC_SECRET",
    );
    expect(repository.initialize).not.toHaveBeenCalled();
  });
});
