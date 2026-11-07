import { describe, expect, it } from "vitest";
import { normalizeEmailAddress } from "./normalize-email-address";

describe("normalizeEmailAddress", () => {
  it("normalizes case and internationalized domains", () => {
    expect(normalizeEmailAddress("  Persona@EJEMPLO.es  ")).toBe(
      "persona@ejemplo.es",
    );
    expect(normalizeEmailAddress("Persona@mañana.es")).toBe(
      "persona@xn--maana-pta.es",
    );
  });

  it("rejects malformed and oversized addresses", () => {
    expect(normalizeEmailAddress("no-es-correo")).toBeNull();
    expect(normalizeEmailAddress(`${"a".repeat(250)}@example.com`)).toBeNull();
  });
});
