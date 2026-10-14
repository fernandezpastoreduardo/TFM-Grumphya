import { describe, expect, it } from "vitest";
import {
  InvalidModelDecisionError,
  validateModelDecision,
} from "./evaluation-decision";

const IDEA_TEXT =
  "Pagamos cualquier declaración sin comprobarla para obtener ingresos recurrentes.";
const TIME_SENSITIVE_PROMISE_IDEA =
  "El servicio promete mostrar resultados actuales a sus usuarios.";
const VALID_MESSAGE =
  "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.";
const REJECTION_MESSAGE =
  "Pagar por declaraciones que nadie verifica convierte el engaño en el negocio más rentable de tu app.";
const INSUFFICIENT_MESSAGE =
  "Esto todavía no describe una idea evaluable; hay más misterio que producto y eso no ayuda a puntuarlo.";
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
    safeTitle: null,
    message: VALID_MESSAGE,
    hardSetup: null,
    hardConsequence: null,
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
    safeTitle: "Cobrar por promesas sin verificar",
    message: REJECTION_MESSAGE,
    hardSetup: "un negocio que paga por declaraciones sin comprobarlas",
    hardConsequence: "nadie sabe si esas declaraciones son ciertas",
  };
}

function createInsufficientDecision() {
  return {
    status: "IDEA_INSUFICIENTE",
    evaluated: [],
    stop_at: null,
    reason_code: null,
    basis: null,
    safeTitle: null,
    message: INSUFFICIENT_MESSAGE,
    hardSetup: null,
    hardConsequence: null,
  };
}

function createCorePromiseRejection() {
  return {
    status: "RECHAZADA",
    evaluated: [
      { id: "C01", state: "PUNTUADO", score: 79 },
      { id: "C02", state: "PUNTUADO", score: 79 },
      { id: "C03", state: "PUNTUADO", score: 79 },
      { id: "C04", state: "PUNTUADO", score: 28 },
      { id: "C05", state: "PUNTUADO", score: 79 },
      { id: "C06", state: "PUNTUADO", score: 79 },
      { id: "C07", state: "PUNTUADO", score: 10 },
    ],
    stop_at: "C07",
    reason_code: CRITERION_REASON_CODES.C07,
    basis: "resultados actuales",
    safeTitle: "Promesas sin respaldo verificable",
    message:
      "Prometer resultados actuales sin mantenerlos fiables deja al usuario pagando por información caducada.",
    hardSetup:
      "un servicio que promete información actual sin mantenerla al día",
    hardConsequence: "el usuario acabaría pagando por información caducada",
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

  it("accepts a rejection grounded in a literal phrase from the core promise", () => {
    expect(
      validateModelDecision(
        createCorePromiseRejection(),
        TIME_SENSITIVE_PROMISE_IDEA,
      ),
    ).toEqual(createCorePromiseRejection());
  });

  it("rejects quotation marks added around a basis fragment", () => {
    expect(() =>
      validateModelDecision(
        {
          ...createCorePromiseRejection(),
          basis: '"resultados actuales"',
        },
        TIME_SENSITIVE_PROMISE_IDEA,
      ),
    ).toThrow(/respuesta del evaluador no válida/i);
  });

  it.each([
    null,
    "",
    "corto",
    "Título con\nsalto",
    "contacto usuario@example.com",
    "visita https://example.es",
    "llama al 612 345 678",
    IDEA_TEXT.slice(0, 30),
  ])("rejects unsafe rejected title: %s", (safeTitle) => {
    expect(() =>
      validateModelDecision(
        { ...createRejectedDecision(), safeTitle },
        IDEA_TEXT,
      ),
    ).toThrow(/respuesta del evaluador no válida/i);
  });

  it("requires no safe title for non-rejected decisions", () => {
    expect(() =>
      validateModelDecision(
        { ...createCompleteDecision(), safeTitle: "Título genérico válido" },
        IDEA_TEXT,
      ),
    ).toThrow(/respuesta del evaluador no válida/i);
  });

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
    "El bloqueo conceptual deja al usuario sin una salida clara.",
    `${"palabra ".repeat(41)}termina.`,
    "x".repeat(281) + ".",
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

  it.each([
    ["response_shape", null],
    [
      "criteria_prefix",
      {
        ...createCompleteDecision(),
        evaluated: createCompleteDecision().evaluated.map((criterion, index) =>
          index === 1 ? { ...criterion, id: "C01" } : criterion,
        ),
      },
    ],
    [
      "criterion_value",
      {
        ...createCompleteDecision(),
        evaluated: createCompleteDecision().evaluated.map((criterion, index) =>
          index === 0 ? { ...criterion, score: 100 } : criterion,
        ),
      },
    ],
    ["decision_fields", { ...createCompleteDecision(), stop_at: "C01" }],
    ["visible_message", { ...createCompleteDecision(), message: "Muy corto." }],
    [
      "decision_semantics",
      {
        ...createRejectedDecision(),
        evaluated: createRejectedDecision().evaluated.map((item, index) =>
          index === createRejectedDecision().evaluated.length - 1
            ? { ...item, score: 20 }
            : item,
        ),
      },
    ],
  ] as const)(
    "classifies invalid decisions as %s",
    (expectedCode, decision) => {
      let thrown: unknown;
      try {
        validateModelDecision(decision, IDEA_TEXT);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(InvalidModelDecisionError);
      expect(thrown).toHaveProperty("validationCode", expectedCode);
      expect(String(thrown)).not.toContain(IDEA_TEXT);
    },
  );

  it.each([null, 42, { ideaText: IDEA_TEXT }])(
    "rejects a non-text idea supplied to the decision validator",
    (ideaText) => {
      expect(() =>
        validateModelDecision(createCompleteDecision(), ideaText),
      ).toThrow(/respuesta del evaluador no válida/i);
    },
  );
});
