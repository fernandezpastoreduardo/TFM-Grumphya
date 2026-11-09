import { describe, expect, it } from "vitest";
import { containsEmailAddress, isEmailAddress } from "./email-address";

describe("email address helpers", () => {
  it.each([
    ["persona@example.es", true],
    ["persona@example..es", true],
    ["persona@localhost", false],
    ["persona@@example.es", false],
    ["persona @example.es", false],
  ])("validates %j as %s", (value, expected) => {
    expect(isEmailAddress(value)).toBe(expected);
  });

  it("detects an address embedded in generated copy", () => {
    expect(containsEmailAddress("Contacta con persona@example.es.")).toBe(true);
  });
});
