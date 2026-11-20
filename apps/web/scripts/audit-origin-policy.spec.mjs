import { describe, expect, it } from "vitest";
import { isAllowedThirdPartyOrigin } from "./audit-origin-policy.mjs";

const ALLOWED_ORIGIN = "https://desarrolloseguro.org";

describe("isAllowedThirdPartyOrigin", () => {
  it("allows only the configured HTTPS origin", () => {
    expect(isAllowedThirdPartyOrigin(ALLOWED_ORIGIN)).toBe(true);
  });

  it("rejects the same hostname over HTTP", () => {
    const httpOrigin = new URL("http://desarrolloseguro.org").origin;

    expect(isAllowedThirdPartyOrigin(httpOrigin)).toBe(false);
  });

  it("rejects the same HTTPS hostname on a different port", () => {
    const alternatePortOrigin = new URL("https://desarrolloseguro.org:8443")
      .origin;

    expect(isAllowedThirdPartyOrigin(alternatePortOrigin)).toBe(false);
  });

  it("accepts the explicit default HTTPS port as the same origin", () => {
    const defaultPortOrigin = new URL("https://desarrolloseguro.org:443")
      .origin;

    expect(isAllowedThirdPartyOrigin(defaultPortOrigin)).toBe(true);
  });
});
