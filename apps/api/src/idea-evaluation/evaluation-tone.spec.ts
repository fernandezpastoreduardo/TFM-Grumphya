import { describe, expect, it } from "vitest";
import type { ModelDecision } from "./evaluation-decision";
import { renderMessage } from "./evaluation-decision";

const NEUTRAL_MESSAGE =
  "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.";
const HARD_PREFIX = "Menudo plan: ";
const DECISION: ModelDecision = {
  status: "SIN_BLOQUEO_EVIDENTE",
  evaluated: [
    { id: "C01", state: "PUNTUADO", score: 50 },
    { id: "C02", state: "INDETERMINADO", score: null },
    { id: "C03", state: "NO_APLICA", score: null },
    { id: "C04", state: "PUNTUADO", score: 40 },
    { id: "C05", state: "PUNTUADO", score: 45 },
    { id: "C06", state: "PUNTUADO", score: 55 },
    { id: "C07", state: "PUNTUADO", score: 60 },
    { id: "C08", state: "INDETERMINADO", score: null },
    { id: "C09", state: "NO_APLICA", score: null },
  ],
  stop_at: null,
  reason_code: null,
  basis: null,
  message: NEUTRAL_MESSAGE,
};
const LONG_VALID_MESSAGE =
  "Con lo que cuentas todavía no veo contradicción alguna en tu planteamiento, aunque eso no demuestra que haya gente dispuesta a usarlo en condiciones reales.";

describe("renderMessage", () => {
  it("returns the exact neutral message for soft tone", () => {
    expect(renderMessage(DECISION, "soft")).toBe(NEUTRAL_MESSAGE);
  });

  it("adds only the fixed prefix for hard tone", () => {
    expect(renderMessage(DECISION, "hard")).toBe(
      `${HARD_PREFIX}${NEUTRAL_MESSAGE}`,
    );
  });

  it("preserves the decision and its scoring data", () => {
    const beforeRendering = structuredClone(DECISION);

    renderMessage(DECISION, "hard");

    expect(DECISION).toEqual(beforeRendering);
  });

  it("keeps the visible message within its word and UTF-16 length limits", () => {
    const decision = { ...DECISION, message: LONG_VALID_MESSAGE };
    const rendered = renderMessage(decision, "hard");

    expect(rendered.split(/\s+/u)).toHaveLength(27);
    expect(rendered.length).toBeLessThanOrEqual(180);
    expect(rendered.endsWith(".")).toBe(true);
  });

  it("rejects a tone outside the public tone options without echoing it", () => {
    expect(() => renderMessage(DECISION, "snarky")).toThrowError(
      new Error("Tono de evaluación no válido."),
    );
  });
});
