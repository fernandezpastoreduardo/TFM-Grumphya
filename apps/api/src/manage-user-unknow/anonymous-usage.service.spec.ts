import { UnauthorizedException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AnonymousUsageRepository } from "./anonymous-usage.models";
import { AnonymousUsageService } from "./anonymous-usage.service";
import { AnonymousIpLimitError } from "./postgres-anonymous-usage.repository";

const IP_HMAC_SECRET = "test-only-anonymous-ip-key";
const COOKIE_TOKEN = "a".repeat(43);
const CLIENT_IP = "192.0.2.15";
const UNUSED_STATE = {
  ideas: { limit: 3 as const, used: 0, remaining: 3 },
  roasts: { limit: 3 as const, used: 0, remaining: 3 },
};

function createRepository() {
  return {
    initialize: vi.fn().mockResolvedValue(true),
    getUsage: vi.fn().mockResolvedValue(UNUSED_STATE),
    reserve: vi.fn(),
    commit: vi.fn(),
    release: vi.fn(),
  } as unknown as AnonymousUsageRepository & {
    initialize: ReturnType<typeof vi.fn>;
    getUsage: ReturnType<typeof vi.fn>;
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

  it("fails closed when the IP HMAC secret is missing", async () => {
    const repository = createRepository();
    const service = new AnonymousUsageService(repository, " ");

    await expect(service.initialize(undefined, CLIENT_IP)).rejects.toThrow(
      "ANONYMOUS_IP_HMAC_SECRET",
    );
    expect(repository.initialize).not.toHaveBeenCalled();
  });
});
