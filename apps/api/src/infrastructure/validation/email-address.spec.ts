import { describe, expect, it } from "vitest";
import { containsEmailAddress, isEmailAddress } from "./email-address";

describe("email address validation", () => {
  it.each([
    ["persona@example.es", true],
    ["persona@example..es", true],
    ["persona@localhost", false],
    ["persona@@example.es", false],
    ["persona @example.es", false],
    ["@example.es", false],
  ])("validates %j as %s", (value, expected) => {
    expect(isEmailAddress(value)).toBe(expected);
  });

  it.each([
    ["Escríbeme a persona@example.es.", true],
    ["No incluyas persona@example", false],
    ["No hay correo en este texto", false],
  ])("detects an email in %j as %s", (value, expected) => {
    expect(containsEmailAddress(value)).toBe(expected);
  });
});
