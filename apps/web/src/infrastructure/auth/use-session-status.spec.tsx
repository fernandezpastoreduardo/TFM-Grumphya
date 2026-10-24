import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStatus } from "./use-session-status";
import type { AccountAttempts } from "./use-session-status";

const authenticatedFetch = vi.hoisted(() => vi.fn());
const clearAccessToken = vi.hoisted(() => vi.fn());
const notifySessionChanged = vi.hoisted(() => vi.fn());
const LOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(window, "location");
vi.mock("./session", () => ({
  authenticatedFetch,
  clearAccessToken,
  notifySessionChanged,
  SESSION_EXPIRED_EVENT: "session-expired",
  USER_AVATAR_UPDATED_EVENT: "avatar-updated",
}));

describe("useSessionStatus", () => {
  beforeEach(() => {
    clearAccessToken.mockClear();
    notifySessionChanged.mockClear();
    authenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { role: "admin", roastMessagesSent: 0, avatarUrl: null },
          plans: [
            {
              plan: "ILUMINADO",
              status: "inactive",
              attemptsRemaining: { ideas: 0, roasts: 0 },
            },
            {
              plan: "FALTON",
              status: "inactive",
              attemptsRemaining: { ideas: 0, roasts: 0 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (LOCATION_DESCRIPTOR)
      Object.defineProperty(window, "location", LOCATION_DESCRIPTOR);
  });

  it("grants the admin unlimited UI attempts without requiring active plans", async () => {
    const { result } = renderHook(() => useSessionStatus());
    await waitFor(() =>
      expect(result.current.accountAttempts?.isAdmin).toBe(true),
    );
    expect(result.current.accountAttempts).toMatchObject({
      ideasPlanActive: true,
      roastsPlanActive: true,
      isAdmin: true,
    });
    expect(result.current.accountAttempts?.ideas).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(result.current.accountAttempts?.roasts).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("refreshes daily plan attempts after a completed use", async () => {
    const createProfileResponse = (ideas: number) =>
      new Response(
        JSON.stringify({
          user: { role: "user", roastMessagesSent: 0, avatarUrl: null },
          plans: [
            {
              plan: "ILUMINADO",
              status: "active",
              attemptsRemaining: { ideas, roasts: 0 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    authenticatedFetch
      .mockResolvedValueOnce(createProfileResponse(11))
      .mockResolvedValueOnce(createProfileResponse(10));
    const { result } = renderHook(() => useSessionStatus());
    await waitFor(() => expect(result.current.accountAttempts?.ideas).toBe(11));

    let refreshedAttempts: AccountAttempts | null = null;
    await act(async () => {
      refreshedAttempts = await result.current.refresh();
    });

    expect(refreshedAttempts).toMatchObject({
      ideas: 10,
      ideasPlanActive: true,
    });
    expect(result.current.accountAttempts?.ideas).toBe(10);
  });

  it("logs out locally, notifies other tabs, and redirects after the API request", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    const logoutFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", logoutFetch);
    const { result } = renderHook(() => useSessionStatus());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => result.current.signOut());

    expect(logoutFetch).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(clearAccessToken).toHaveBeenCalledOnce();
    expect(notifySessionChanged).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({
      isAuthenticated: false,
      accountAttempts: null,
      avatarUrl: null,
      isSigningOut: false,
    });
    expect(assign).toHaveBeenCalledWith("/");
  });
});
