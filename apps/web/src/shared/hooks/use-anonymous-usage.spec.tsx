import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAnonymousUsage } from "./use-anonymous-usage";

const USAGE_ENDPOINT = "/api/anonymous-usage";
const UNUSED_USAGE = {
  ideas: { limit: 3, used: 0, remaining: 3 },
  roasts: { limit: 3, used: 0, remaining: 3 },
};

afterEach(() => vi.unstubAllGlobals());

describe("useAnonymousUsage", () => {
  it("initializes the browser profile through the API and exposes server quotas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => UNUSED_USAGE });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAnonymousUsage());

    await waitFor(() => expect(result.current.usage).toEqual(UNUSED_USAGE));
    expect(fetchMock).toHaveBeenCalledWith(USAGE_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("does not invent a local quota when the server is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const { result } = renderHook(() => useAnonymousUsage());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.usage).toBeNull();
    expect(result.current.error).toContain("No se han podido cargar");
  });

  it("explains the temporary IP profile limit using Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => "3600" },
        json: async () => ({ code: "ANONYMOUS_PROFILE_RATE_LIMITED" }),
      }),
    );

    const { result } = renderHook(() => useAnonymousUsage());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toContain("dentro de 1 h");
  });

  it("reloads server counts after a completed operation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => UNUSED_USAGE });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAnonymousUsage());
    await waitFor(() => expect(result.current.usage).toEqual(UNUSED_USAGE));
    await act(async () => result.current.refresh());

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
