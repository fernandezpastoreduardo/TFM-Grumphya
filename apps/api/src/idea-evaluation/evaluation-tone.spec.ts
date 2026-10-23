import { describe, expect, it } from "vitest";
import type { ModelDecision } from "./evaluation-decision";
import { renderHeadline, renderMessage } from "./evaluation-decision";

const NEUTRAL_MESSAGE =
  "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.";
const SOFT_MESSAGE_PREFIX =
  "¡Qué ilusión poder acompañarte con todo el cariño! ";
const HARD_CLEAR_MESSAGE_PREFIX = "No hay motivo para celebrar todavía: ";
const HARD_REJECTION_MESSAGE_PREFIX =
  "La propuesta se ha pegado un buen batacazo justo en lo esencial: ";
const SOFT_MESSAGE_PREFIX_WORD_COUNT = 8;
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
    { id: "C10", state: "PUNTUADO", score: 50 },
  ],
  stop_at: null,
  reason_code: null,
  basis: null,
  safeTitle: null,
  message: NEUTRAL_MESSAGE,
  hardSetup: "un grillo usando un móvil o un ordenador",
  hardConsequence: "sin esa interacción, nadie llega a encontrarse",
};
const LONG_VALID_MESSAGE =
  "Con lo que cuentas todavía no veo contradicción alguna en tu planteamiento, aunque eso no demuestra que haya gente dispuesta a usarlo en condiciones reales.";

describe("renderMessage", () => {
  it("preserves the factual explanation while applying a distinct tone", () => {
    expect(renderMessage(DECISION, "soft")).toBe(
      `${SOFT_MESSAGE_PREFIX}${NEUTRAL_MESSAGE}`,
    );
    expect(renderMessage(DECISION, "hard")).toBe(
      `${HARD_CLEAR_MESSAGE_PREFIX}${NEUTRAL_MESSAGE}`,
    );
    expect(
      renderMessage(
        {
          ...DECISION,
          status: "RECHAZADA",
          hardSetup: "un grillo usando un móvil o un ordenador",
          hardConsequence: "sin esa interacción, nadie llega a encontrarse",
        },
        "hard",
      ),
    ).toBe(`${HARD_REJECTION_MESSAGE_PREFIX}${NEUTRAL_MESSAGE}`);
    expect(renderHeadline("RECHAZADA", "soft")).toBe(
      "¡Un abrazo y confeti para esta pega importante!",
    );
    expect(renderHeadline("RECHAZADA", "hard")).toBe(
      "La propuesta se ha estampado contra lo esencial.",
    );
    expect(renderHeadline("SIN_BLOQUEO_EVIDENTE", "soft")).toBe(
      "¡Qué ilusión! Ha superado el primer repaso.",
    );
    expect(renderHeadline("SIN_BLOQUEO_EVIDENTE", "hard")).toBe(
      "Sigue en pie. No es para celebrarlo.",
    );
    expect(renderHeadline("IDEA_INSUFICIENTE", "soft")).toBe(
      "¡Con cariño y confeti, aún falta aterrizar la idea!",
    );
    expect(renderHeadline("IDEA_INSUFICIENTE", "hard")).toBe(
      "Mucho tráiler; falta la película.",
    );
  });

  it("preserves the decision and its scoring data", () => {
    const beforeRendering = structuredClone(DECISION);

    renderMessage(DECISION, "soft");

    expect(DECISION).toEqual(beforeRendering);
  });

  it("keeps the visible message within its word and UTF-16 length limits", () => {
    const decision = { ...DECISION, message: LONG_VALID_MESSAGE };
    const rendered = renderMessage(decision, "soft");

    expect(rendered.split(/\s+/u)).toHaveLength(
      25 + SOFT_MESSAGE_PREFIX_WORD_COUNT,
    );
    expect(rendered.length).toBeLessThanOrEqual(360);
    expect(rendered.endsWith(".")).toBe(true);
  });

  it("rejects a tone outside the public tone options without echoing it", () => {
    expect(() => renderHeadline("RECHAZADA", "snarky")).toThrowError(
      new Error("Tono de evaluación no válido."),
    );
  });

  it("explains criterion aliases in ordinary language instead of exposing their codes", () => {
    const decision = {
      ...DECISION,
      message:
        "El criterio C05 revela una dependencia de afirmaciones sin verificar y C10 muestra una diferencia concreta frente a otras aplicaciones.",
    };

    const rendered = renderMessage(decision, "soft");

    expect(rendered).not.toMatch(/\bC(?:0[1-9]|10)\b/u);
    expect(rendered).toContain(
      "confianza en afirmaciones que no se pueden verificar",
    );
    expect(rendered).toContain(
      "diferencia concreta frente a otras aplicaciones",
    );
  });

  it.each([
    ["C01", "privacidad y el acceso a datos"],
    ["C02", "riesgo de daño grave"],
    ["C03", "engaño o la explotación"],
    ["C04", "contradicción o la falta de un mecanismo imprescindible"],
    ["C05", "confianza en afirmaciones que no se pueden verificar"],
    ["C06", "conflicto sin una forma de resolverlo"],
    ["C07", "función que no cumple su promesa"],
    ["C08", "incompatibilidad entre ingresos y costes"],
    ["C09", "falta de una alternativa cuando algo falla"],
    ["C10", "diferencia frente a otras aplicaciones"],
    ["PRIVACIDAD_ESTRUCTURAL", "privacidad y el acceso a datos"],
    ["PELIGRO_ESTRUCTURAL", "riesgo de daño grave"],
    ["ETICA_ESTRUCTURAL", "engaño o la explotación"],
    [
      "CONTRADICCION_NUCLEO",
      "contradicción o la falta de un mecanismo imprescindible",
    ],
    [
      "HONESTIDAD_ESTRUCTURAL",
      "confianza en afirmaciones que no se pueden verificar",
    ],
    ["CONFLICTO_ESTRUCTURAL", "conflicto sin una forma de resolverlo"],
    ["UTILIDAD_ANULADA", "función que no cumple su promesa"],
    [
      "VALOR_USUARIO_NO_DEFINIDO",
      "falta de un motivo concreto para usar la aplicación",
    ],
    ["ECONOMIA_INCOMPATIBLE", "incompatibilidad entre ingresos y costes"],
    ["HAPPY_PATH_ESTRUCTURAL", "falta de una alternativa cuando algo falla"],
    ["DIFERENCIACION_AUSENTE", "diferencia frente a otras aplicaciones"],
  ])("replaces the internal rubric alias %s", (alias, explanation) => {
    const rendered = renderMessage(
      {
        ...DECISION,
        message: `La propuesta falla en el criterio ${alias} y eso afecta directamente a sus usuarios.`,
      },
      "soft",
    );

    expect(rendered).not.toContain(alias);
    expect(rendered).toContain(explanation);
  });
});
