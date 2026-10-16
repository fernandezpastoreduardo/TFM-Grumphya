import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AccessTokenConfigurationError,
  issueAccessToken,
  verifyAccessToken,
} from "./access-token";

const SECRET = "test-only-secret-with-at-least-32-characters";

describe("access JWT", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ACCESS_TOKEN_SECRET;
  });

  it("issues a ten-minute token with a user subject and verifies its claims", () => {
    process.env.ACCESS_TOKEN_SECRET = SECRET;

    const issued = issueAccessToken("00000000-0000-4000-8000-000000000001");

    expect(issued.expiresIn).toBe(600);
    expect(verifyAccessToken(issued.token)).toMatchObject({
      userId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("issues distinct tokens for the same user in the same second", () => {
    process.env.ACCESS_TOKEN_SECRET = SECRET;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));

    const first = issueAccessToken("00000000-0000-4000-8000-000000000001");
    const second = issueAccessToken("00000000-0000-4000-8000-000000000001");

    expect(first.token).not.toBe(second.token);
    expect(verifyAccessToken(first.token)).toMatchObject({
      userId: "00000000-0000-4000-8000-000000000001",
    });
    expect(verifyAccessToken(second.token)).toMatchObject({
      userId: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("rejects malformed, tampered, expired and wrong-secret tokens", () => {
    process.env.ACCESS_TOKEN_SECRET = SECRET;
    const issued = issueAccessToken("00000000-0000-4000-8000-000000000001");
    const [header, payload] = issued.token.split(".");

    expect(verifyAccessToken("not-a-jwt")).toBeNull();
    expect(verifyAccessToken(`${header}.${payload}.tampered`)).toBeNull();
    process.env.ACCESS_TOKEN_SECRET = "another-test-secret-of-at-least-32-chars";
    expect(verifyAccessToken(issued.token)).toBeNull();
  });

  it("requires a sufficiently strong secret from the environment", () => {
    delete process.env.ACCESS_TOKEN_SECRET;

    expect(() => issueAccessToken("00000000-0000-4000-8000-000000000001"))
      .toThrow(AccessTokenConfigurationError);
  });
});
