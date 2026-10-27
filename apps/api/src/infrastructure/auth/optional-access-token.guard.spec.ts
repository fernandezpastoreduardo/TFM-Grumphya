import { describe, expect, it, vi } from "vitest";
import { OptionalAccessTokenGuard } from "./optional-access-token.guard";
import { issueAccessToken } from "./access-token";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const SECRET = "optional-guard-test-secret-at-least-32-bytes";

describe("optional access token guard", () => {
  it("allows anonymous requests without assigning a user", async () => {
    const guard = new OptionalAccessTokenGuard({ isActive: vi.fn() });
    const request = { get: () => undefined };

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(request).not.toHaveProperty("user");
  });

  it("rejects malformed bearer authorization without looking up a session", async () => {
    const lookup = { isActive: vi.fn() };
    const guard = new OptionalAccessTokenGuard(lookup);
    const request = { get: () => "Bearer token with spaces" };

    await expect(guard.canActivate(httpContext(request))).rejects.toMatchObject(
      {
        response: { code: "SESSION_REQUIRED" },
      },
    );
    expect(lookup.isActive).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token and attaches a valid active user", async () => {
    process.env.ACCESS_TOKEN_SECRET = SECRET;
    const issued = issueAccessToken(USER_ID);
    const lookup = { isActive: vi.fn().mockResolvedValue(true) };
    const guard = new OptionalAccessTokenGuard(lookup);
    const request = {
      get: (name: string) =>
        name === "authorization" ? `Bearer ${issued.token}` : undefined,
    };

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({ user: { userId: USER_ID } });
    expect(lookup.isActive).toHaveBeenCalledOnce();
  });
});

function httpContext(request: object) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}
