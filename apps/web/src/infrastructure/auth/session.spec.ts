import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticatedFetch, clearAccessToken, getAccessToken, setAccessToken } from "./session";

const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";

describe("authenticated session client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAccessToken();
  });

  it("refreshes the HttpOnly session cookie when no in-memory access token exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: ACCESS_TOKEN }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAccessToken()).resolves.toBe(ACCESS_TOKEN);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/refresh", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
    }));
  });

  it("sends the access token as a bearer token for protected APIs", async () => {
    setAccessToken(ACCESS_TOKEN);
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await authenticatedFetch("/api/account/profile");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/profile",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(authorizationFrom(fetchMock.mock.calls[0]?.[1])).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
  });

  it("retries once with a refreshed bearer token after an expired access token", async () => {
    setAccessToken(ACCESS_TOKEN);
    const refreshedToken = `${ACCESS_TOKEN}.new`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: refreshedToken }), { status: 201 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await authenticatedFetch("/api/account/profile");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authorizationFrom(fetchMock.mock.calls[2]?.[1])).toBe(
      `Bearer ${refreshedToken}`,
    );
  });
});

function authorizationFrom(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get("Authorization");
}
