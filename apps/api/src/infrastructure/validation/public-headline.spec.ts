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
    "Llama al 612 345 678",
    "Una frase\ncon salto",
    "Este titular supera claramente el máximo de ciento veinte caracteres porque sigue añadiendo palabras sin ninguna necesidad y al final acaba siendo demasiado largo para la interfaz de usuario.",
    "Una idea que tiene demasiadas palabras y supera el límite máximo permitido para un titular generado claramente",
    "Titular con * formato",
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
