import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStatus } from "./use-session-status";

const authenticatedFetch = vi.hoisted(() => vi.fn());
vi.mock("./session", () => ({
  authenticatedFetch,
  clearAccessToken: vi.fn(),
  SESSION_EXPIRED_EVENT: "session-expired",
  USER_AVATAR_UPDATED_EVENT: "avatar-updated",
}));

describe("useSessionStatus", () => {
  beforeEach(() => {
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
});
