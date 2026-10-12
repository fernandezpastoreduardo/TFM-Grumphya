import { describe, expect, it } from "vitest";
import {
  InvalidModelDecisionError,
  validateModelDecision,
} from "./evaluation-decision";

const IDEA_TEXT =
  "Pagamos cualquier declaración sin comprobarla para obtener ingresos recurrentes.";
const VALID_MESSAGE =
  "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.";
const REJECTION_MESSAGE =
  "Pagar por declaraciones que nadie verifica convierte el engaño en el negocio más rentable de tu app.";
const INSUFFICIENT_MESSAGE =
  "Cuéntame qué haría la app y para quién, porque todavía no hay una idea concreta que pueda valorar.";
const CRITERION_IDS = [
  "C01",
  "C02",
  "C03",
  "C04",
  "C05",
  "C06",
  "C07",
  "C08",
  "C09",
] as const;
const CRITERION_REASON_CODES = {
  C01: "PRIVACIDAD_ESTRUCTURAL",
  C02: "PELIGRO_ESTRUCTURAL",
  C03: "ETICA_ESTRUCTURAL",
  C04: "CONTRADICCION_NUCLEO",
  C05: "HONESTIDAD_ESTRUCTURAL",
  C06: "CONFLICTO_ESTRUCTURAL",
  C07: "UTILIDAD_ANULADA",
  C08: "ECONOMIA_INCOMPATIBLE",
  C09: "HAPPY_PATH_ESTRUCTURAL",
} as const;

function createCompleteDecision() {
  return {
    status: "SIN_BLOQUEO_EVIDENTE",
    evaluated: CRITERION_IDS.map((id) => ({
      id,
      state: "PUNTUADO",
      score: 50,
    })),
    stop_at: null,
    reason_code: null,
    basis: null,
    message: VALID_MESSAGE,
  };
}

function createRejectedDecision() {
  return {
    status: "RECHAZADA",
    evaluated: [
      { id: "C01", state: "NO_APLICA", score: null },
      { id: "C02", state: "NO_APLICA", score: null },
      { id: "C03", state: "INDETERMINADO", score: null },
      { id: "C04", state: "PUNTUADO", score: 60 },
      { id: "C05", state: "PUNTUADO", score: 10 },
    ],
    stop_at: "C05",
    reason_code: CRITERION_REASON_CODES.C05,
    basis: "Pagamos cualquier declaración sin comprobarla",
    message: REJECTION_MESSAGE,
  };
}

function createInsufficientDecision() {
  return {
    status: "IDEA_INSUFICIENTE",
    evaluated: [],
    stop_at: null,
    reason_code: null,
    basis: null,
    message: INSUFFICIENT_MESSAGE,
  };
}

describe("validateModelDecision", () => {
  it.each([
    { decision: createCompleteDecision(), ideaText: IDEA_TEXT },
    { decision: createRejectedDecision(), ideaText: IDEA_TEXT },
    { decision: createInsufficientDecision(), ideaText: IDEA_TEXT },
  ])(
    "accepts a consistent $decision.status decision",
    ({ decision, ideaText }) => {
      expect(validateModelDecision(decision, ideaText)).toMatchObject(decision);
    },
  );

  it.each([
    { ...createCompleteDecision(), status: "ERROR_EVALUACION" },
    { ...createCompleteDecision(), evaluated: [] },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.slice(0, 8),
    },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 4 ? { ...item, id: "C06" } : item,
      ),
    },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, id: "C02" } : item,
      ),
    },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, score: 80 } : item,
      ),
    },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, score: 10.5 } : item,
      ),
    },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, score: -1 } : item,
      ),
    },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, score: null } : item,
      ),
    },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, state: "INDETERMINADO", score: 50 } : item,
      ),
    },
    {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, state: "UNKNOWN", score: null } : item,
      ),
    },
    {
      ...createRejectedDecision(),
      evaluated: createRejectedDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, score: 10, state: "PUNTUADO" } : item,
      ),
    },
    {
      ...createRejectedDecision(),
      evaluated: createRejectedDecision().evaluated.map((item, index) =>
        index === 4 ? { ...item, score: 15 } : item,
      ),
    },
    { ...createRejectedDecision(), stop_at: "C04" },
    { ...createRejectedDecision(), reason_code: "ETICA_ESTRUCTURAL" },
    { ...createRejectedDecision(), basis: "texto inventado" },
    {
      ...createInsufficientDecision(),
      evaluated: [{ id: "C01", state: "PUNTUADO", score: 50 }],
    },
    { ...createInsufficientDecision(), stop_at: "C01" },
    {
      ...createInsufficientDecision(),
      reason_code: CRITERION_REASON_CODES.C01,
    },
    { ...createInsufficientDecision(), basis: "fragmento" },
  ])("rejects an inconsistent evaluator decision", (decision) => {
    expect(() => validateModelDecision(decision, IDEA_TEXT)).toThrow(
      /respuesta del evaluador no válida/i,
    );
  });

  it.each([
    "  " + VALID_MESSAGE,
    `${VALID_MESSAGE}\nOtra línea.`,
    "Una frase. Otra frase que invalida el formato previsto.",
    "- " + VALID_MESSAGE,
    "• " + VALID_MESSAGE,
    "Texto de respuesta demasiado corto.",
    `${"palabra ".repeat(26)}termina.`,
    "x".repeat(161) + ".",
  ])("rejects malformed neutral message: %s", (message) => {
    expect(() =>
      validateModelDecision(
        { ...createCompleteDecision(), message },
        IDEA_TEXT,
      ),
    ).toThrow(/respuesta del evaluador no válida/i);
  });

  it("drops unrecognized fields and does not mutate the provider result", () => {
    const decision = {
      ...createCompleteDecision(),
      privateProviderData: "secret",
      evaluated: createCompleteDecision().evaluated.map((item, index) =>
        index === 0 ? { ...item, privateNote: "secret" } : item,
      ),
    };
    const original = structuredClone(decision);

    const validated = validateModelDecision(decision, IDEA_TEXT);

    expect(validated).not.toHaveProperty("privateProviderData");
    expect(validated.evaluated[0]).not.toHaveProperty("privateNote");
    expect(decision).toEqual(original);
  });

  it("uses a generic validation error without echoing raw provider content", () => {
    const hostileValue = {
      ...createCompleteDecision(),
      message: "<script>provider secret</script>",
    };

    let thrown: unknown;
    try {
      validateModelDecision(hostileValue, IDEA_TEXT);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidModelDecisionError);
    expect(String(thrown)).not.toContain("provider secret");
    expect(String(thrown)).not.toContain(IDEA_TEXT);
  });

  it.each([null, 42, { ideaText: IDEA_TEXT }])(
    "rejects a non-text idea supplied to the decision validator",
    (ideaText) => {
      expect(() =>
        validateModelDecision(createCompleteDecision(), ideaText),
      ).toThrow(/respuesta del evaluador no válida/i);
    },
  );
});
