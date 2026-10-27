import { describe, expect, it } from "vitest";
import { isSafeGeneratedHeadline } from "./public-headline";

describe("isSafeGeneratedHeadline", () => {
  it("accepts concise, audience-safe Spanish copy", () => {
    expect(isSafeGeneratedHeadline("La idea sigue en pie, de momento.")).toBe(
      true,
    );
  });

  it.each([
    "",
    "C07 suspenso",
    "Mira https://example.com",
    "Escribe en mail@example.com",
    "Una frase\ncon salto",
  ])("rejects unsafe or invalid headline: %s", (headline) => {
    expect(isSafeGeneratedHeadline(headline)).toBe(false);
  });

  it("rejects long verbatim fragments of submitted idea text", () => {
    expect(
      isSafeGeneratedHeadline(
        "Una idea bastante normal para sorprender a cualquiera",
        "Una idea bastante normal para sorprender a cualquiera de verdad",
      ),
    ).toBe(false);
  });
});
