import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePendingEmailVerification } from "./use-pending-email-verification";

const STATUS_ENDPOINT = "/api/registration-status";

afterEach(() => vi.unstubAllGlobals());

describe("usePendingEmailVerification", () => {
  it("reads the browser's pending registration from the server without caching", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ emailVerificationPending: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePendingEmailVerification());

    await expect(result.current.check()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(STATUS_ENDPOINT, {
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("checks the server again after verification and exposes the new state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ emailVerificationPending: true }))
      .mockResolvedValueOnce(
        Response.json({ emailVerificationPending: false }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePendingEmailVerification());
    await expect(result.current.check()).resolves.toBe(true);
    await expect(result.current.check()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: "a failed request", response: { ok: false } },
    {
      name: "an invalid response body",
      response: Response.json({ emailVerificationPending: "false" }),
    },
  ])("does not treat $name as a verified result", async ({ response }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const { result } = renderHook(() => usePendingEmailVerification());

    await expect(result.current.check()).resolves.toBeNull();
  });
});
