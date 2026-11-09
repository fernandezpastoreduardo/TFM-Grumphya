import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recordAnonymousPageView,
  recordAnonymousPlanSelection,
} from "./anonymous-analytics";

const ANALYTICS_ENDPOINT = "/api/anonymous-analytics";
const PRICING_PATHS = ["/precios", "/crear-cuenta/planes"] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("anonymous analytics client", () => {
  it.each(PRICING_PATHS)(
    "records %s as an allowlisted plans page without credentials",
    async (path) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockReturnValue({ matches: true }),
      });

      recordAnonymousPageView(path);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(ANALYTICS_ENDPOINT);
      expect(options).toMatchObject({
        method: "POST",
        mode: "same-origin",
        credentials: "omit",
        cache: "no-store",
        keepalive: true,
        referrerPolicy: "no-referrer",
      });
      expect(JSON.parse(String(options.body))).toEqual({
        event: "page_view",
        page: "precios",
        plan: null,
        device: "mobile",
      });
    },
  );

  it("does not send page views for routes outside the public allowlist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    recordAnonymousPageView("/cuenta/privada");
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a plan choice as a coarse event without retaining fetch failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network detail"));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    expect(() => recordAnonymousPlanSelection("FALTON")).not.toThrow();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({
      event: "plan_selection",
      page: "precios",
      plan: "FALTON",
      device: "desktop",
    });
  });
});
