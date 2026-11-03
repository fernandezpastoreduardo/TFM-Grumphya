import { describe, expect, it } from "vitest";
import { parseAnonymousAnalyticsInput } from "./anonymous-analytics.models";

describe("parseAnonymousAnalyticsInput", () => {
  it("accepts a public page view with only the approved aggregate dimensions", () => {
    expect(
      parseAnonymousAnalyticsInput({
        event: "page_view",
        page: "precios",
        device: "mobile",
        plan: null,
      }),
    ).toEqual({
      event: "page_view",
      page: "precios",
      device: "mobile",
      plan: null,
    });
  });

  it("accepts a selected plan only on the plans page", () => {
    expect(
      parseAnonymousAnalyticsInput({
        event: "plan_selection",
        page: "precios",
        device: "desktop",
        plan: "FALTON",
      }),
    ).toMatchObject({ event: "plan_selection", plan: "FALTON" });
  });

  it.each([
    null,
    {
      event: "page_view",
      page: "precios",
      device: "mobile",
      plan: null,
      sessionId: "x",
    },
    { event: "page_view", page: "perfil", device: "mobile", plan: null },
    {
      event: "page_view",
      page: "precios",
      device: "mobile",
      plan: "ILUMINADO",
    },
    { event: "plan_selection", page: "home", device: "mobile", plan: "FALTON" },
  ])("rejects malformed or identifying payloads", (payload) => {
    expect(parseAnonymousAnalyticsInput(payload)).toBeNull();
  });
});
