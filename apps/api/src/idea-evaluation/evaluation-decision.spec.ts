import { describe, expect, it } from "vitest";
import {
  InvalidModelDecisionError,
  renderMessage,
  validateModelDecision,
} from "./evaluation-decision";

const IDEA_TEXT =
  "Pagamos cualquier declaración sin comprobarla para obtener ingresos recurrentes.";
const GENERIC_TRAINING_LOG_IDEA =
  "Una app que sirva para registrar entrenamientos";
const LOW_VALUE_METRIC_IDEA =
  "Una app para contar cuántas veces alguien se ata los cordones.";
const LOW_VALUE_METRIC_BASIS =
  "contar cuántas veces alguien se ata los cordones";
const LOW_VALUE_METRIC_MESSAGE =
  "La idea solo cuenta una acción, pero no define qué problema resuelve ni qué resultado obtiene alguien, así que no ofrece un motivo concreto para empezar o seguir usando la aplicación.";
const PHONE_LIKE_PRODUCT_EXAMPLE = "+34 600 123 456";
const MALFORMED_PRODUCT_EXAMPLE_VALUES: unknown[] = [
  undefined,
  123,
  { name: "Strava" },
];
const TIME_SENSITIVE_PROMISE_IDEA =
  "El servicio promete mostrar resultados actuales a sus usuarios.";
const VALID_MESSAGE =
  "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.";
const REJECTION_MESSAGE =
  "Pagar por declaraciones que nadie verifica convierte el engaño en el negocio más rentable de tu app.";
const HARD_REJECTION_MESSAGE_PREFIX =
  "La propuesta se ha pegado un buen batacazo justo en lo esencial: ";
const INSUFFICIENT_MESSAGE =
  "Esto todavía no describe una idea evaluable; hay más misterio que producto y eso no ayuda a puntuarlo.";
const MAX_NEUTRAL_MESSAGE = `${"amable ".repeat(39)}limpio.`;
const MAX_REJECTION_MESSAGE = `${"idea ".repeat(119)}${"x".repeat(304)}.`;
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
  "C10",
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
  C10: "DIFERENCIACION_AUSENTE",
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
    existingProductExample: null,
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
      { id: "C06", state: "PUNTUADO", score: 50 },
      { id: "C07", state: "PUNTUADO", score: 50 },
      { id: "C08", state: "PUNTUADO", score: 50 },
      { id: "C09", state: "PUNTUADO", score: 50 },
      { id: "C10", state: "PUNTUADO", score: 50 },
    ],
    stop_at: "C05",
    reason_code: CRITERION_REASON_CODES.C05,
    basis: "Pagamos cualquier declaración sin comprobarla",
    safeTitle: "Cobrar por promesas sin verificar",
    existingProductExample: null,
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
    existingProductExample: null,
    message: INSUFFICIENT_MESSAGE,
    hardSetup: null,
    hardConsequence: null,
  };
}

function createGenericTrainingLogRejection() {
  return {
    status: "RECHAZADA",
    evaluated: [
      ...CRITERION_IDS.slice(0, -1).map((id) => ({
        id,
        state: "PUNTUADO",
        score: 50,
      })),
      { id: "C10", state: "PUNTUADO", score: 10 },
    ],
    stop_at: "C10",
    reason_code: CRITERION_REASON_CODES.C10,
    basis: "registrar entrenamientos",
    safeTitle: "Registro deportivo sin propuesta propia",
    existingProductExample: null,
    message:
      "Registrar entrenamientos es una función común y la idea no explica por qué alguien dejaría las opciones habituales para usar esta aplicación.",
    hardSetup: "una app de entrenamientos que no aporta nada distinto",
    hardConsequence: "nadie tiene un motivo concreto para cambiarse a ella",
  };
}

function createUndefinedUserValueRejection() {
  return {
    status: "RECHAZADA",
    evaluated: CRITERION_IDS.map((id) => ({
      id,
      state: "PUNTUADO",
      score: id === "C07" ? 10 : 60,
    })),
    stop_at: "C07",
    reason_code: "VALOR_USUARIO_NO_DEFINIDO",
    basis: LOW_VALUE_METRIC_BASIS,
    safeTitle: "Contador sin beneficio para quien lo usa",
    existingProductExample: null,
    message: LOW_VALUE_METRIC_MESSAGE,
    hardSetup: "una app que cuenta una acción sin explicar para qué sirve",
    hardConsequence: "el usuario no obtiene un resultado que le importe",
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
      { id: "C08", state: "PUNTUADO", score: 50 },
      { id: "C09", state: "PUNTUADO", score: 50 },
      { id: "C10", state: "PUNTUADO", score: 50 },
    ],
    stop_at: "C07",
    reason_code: CRITERION_REASON_CODES.C07,
    basis: "resultados actuales",
    safeTitle: "Promesas sin respaldo verificable",
    existingProductExample: null,
    message:
      "Prometer resultados actuales sin mantenerlos fiables deja al usuario pagando por información caducada.",
    hardSetup:
      "un servicio que promete información actual sin mantenerla al día",
    hardConsequence: "el usuario acabaría pagando por información caducada",
  };
}

describe("validateModelDecision", () => {
  it("rejects a generic training log without a reason to choose it", () => {
    const result = validateModelDecision(
      createGenericTrainingLogRejection(),
      GENERIC_TRAINING_LOG_IDEA,
    );

    expect(result).toMatchObject({
      status: "RECHAZADA",
      stop_at: "C10",
      reason_code: "DIFERENCIACION_AUSENTE",
      safeTitle: "Registro deportivo sin propuesta propia",
    });
  });

  it("preserves a known product example only for a failed C10 comparison", () => {
    const decision = {
      ...createGenericTrainingLogRejection(),
      existingProductExample: "Strava",
    };

    expect(
      validateModelDecision(decision, GENERIC_TRAINING_LOG_IDEA),
    ).toMatchObject({ existingProductExample: "Strava" });
  });

  it("omits an existing product example when C10 does not fail", () => {
    const decision = {
      ...createCompleteDecision(),
      existingProductExample: "Strava",
    };

    expect(
      validateModelDecision(decision, GENERIC_TRAINING_LOG_IDEA),
    ).toMatchObject({
      status: "SIN_BLOQUEO_EVIDENTE",
      existingProductExample: null,
    });
  });

  it("omits a C10 example when an earlier criterion vetoes and C10 also fails", () => {
    const decision = {
      ...createUndefinedUserValueRejection(),
      evaluated: createUndefinedUserValueRejection().evaluated.map(
        (criterion) =>
          criterion.id === "C10" ? { ...criterion, score: 10 } : criterion,
      ),
      existingProductExample: "Strava",
    };

    expect(
      validateModelDecision(decision, LOW_VALUE_METRIC_IDEA),
    ).toMatchObject({
      status: "RECHAZADA",
      stop_at: "C07",
      existingProductExample: null,
    });
  });

  it.each([
    "https://example.com",
    "App <script>",
    "App\nName",
    PHONE_LIKE_PRODUCT_EXAMPLE,
  ])(
    "omits unsafe existing product example names: %s",
    (existingProductExample) => {
      const decision = {
        ...createGenericTrainingLogRejection(),
        existingProductExample,
      };

      expect(
        validateModelDecision(decision, GENERIC_TRAINING_LOG_IDEA),
      ).toMatchObject({
        status: "RECHAZADA",
        existingProductExample: null,
      });
    },
  );

  it.each(MALFORMED_PRODUCT_EXAMPLE_VALUES)(
    "omits a missing or non-string known product example: %s",
    (existingProductExample) => {
      const decision = {
        ...createGenericTrainingLogRejection(),
        existingProductExample,
      };

      expect(
        validateModelDecision(decision, GENERIC_TRAINING_LOG_IDEA),
      ).toMatchObject({
        status: "RECHAZADA",
        existingProductExample: null,
      });
    },
  );

  it("rejects a metric-only idea without an identifiable user need or outcome", () => {
    const result = validateModelDecision(
      createUndefinedUserValueRejection(),
      LOW_VALUE_METRIC_IDEA,
    );

    expect(result).toMatchObject({
      status: "RECHAZADA",
      stop_at: "C07",
      reason_code: "VALOR_USUARIO_NO_DEFINIDO",
    });
  });

  it("does not allow the missing-user-value reason code on another criterion", () => {
    const decision = createUndefinedUserValueRejection();
    decision.stop_at = "C10";
    decision.reason_code = "VALOR_USUARIO_NO_DEFINIDO";
    decision.evaluated = decision.evaluated.map((criterion) => {
      if (criterion.id === "C07") return { ...criterion, score: 50 };
      if (criterion.id === "C10") return { ...criterion, score: 10 };
      return criterion;
    });

    expect(() =>
      validateModelDecision(decision, LOW_VALUE_METRIC_IDEA),
    ).toThrow(InvalidModelDecisionError);
  });

  it("requires a numeric C10 score on complete functional ideas", () => {
    const decision = {
      ...createCompleteDecision(),
      evaluated: CRITERION_IDS.map((id) =>
        id === "C10"
          ? { id, state: "INDETERMINADO", score: null }
          : { id, state: "PUNTUADO", score: 50 },
      ),
    };

    expect(() => validateModelDecision(decision, IDEA_TEXT)).toThrow(
      InvalidModelDecisionError,
    );
  });

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

  it("accepts all evaluated criteria and keeps the first failed criterion as the primary reason", () => {
    const multiFailureDecision = {
      ...createRejectedDecision(),
      evaluated: [
        ...createRejectedDecision().evaluated.slice(0, 5),
        { id: "C06", state: "PUNTUADO", score: 12 },
        { id: "C07", state: "PUNTUADO", score: 9 },
        { id: "C08", state: "PUNTUADO", score: 40 },
        { id: "C09", state: "PUNTUADO", score: 14 },
        { id: "C10", state: "PUNTUADO", score: 52 },
      ],
      message:
        "Falla al comprobar declaraciones, deja conflictos sin remedio, pierde la utilidad principal y depende de una ejecución perfecta en varios puntos esenciales del servicio.",
    };

    expect(
      validateModelDecision(multiFailureDecision, IDEA_TEXT),
    ).toMatchObject({
      status: "RECHAZADA",
      stop_at: "C05",
      reason_code: "HONESTIDAD_ESTRUCTURAL",
      evaluated: expect.arrayContaining([
        { id: "C05", state: "PUNTUADO", score: 10 },
        { id: "C06", state: "PUNTUADO", score: 12 },
        { id: "C07", state: "PUNTUADO", score: 9 },
        { id: "C09", state: "PUNTUADO", score: 14 },
        { id: "C10", state: "PUNTUADO", score: 52 },
      ]),
    });
  });

  it("accepts a longer rejection explanation when it names every failed point", () => {
    const extendedExplanation = `${"explica ".repeat(45)}las consecuencias.`;
    const decision = {
      ...createRejectedDecision(),
      message: extendedExplanation,
    };

    expect(validateModelDecision(decision, IDEA_TEXT).message).toBe(
      extendedExplanation,
    );
  });

  it("makes the hard rejection sharper while preserving its factual explanation", () => {
    const decision = createRejectedDecision();
    const softMessage = renderMessage(decision, "soft");
    const hardMessage = renderMessage(decision, "hard");

    expect(softMessage).toContain(REJECTION_MESSAGE);
    expect(hardMessage).toBe(
      `${HARD_REJECTION_MESSAGE_PREFIX}${REJECTION_MESSAGE}`,
    );
    expect(hardMessage).not.toBe(softMessage);
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

  it.each([
    ["complete", createCompleteDecision],
    ["insufficient", createInsufficientDecision],
  ] as const)(
    "accepts a %s message at the 280-character and 40-word limits",
    (_label, createDecision) => {
      expect(MAX_NEUTRAL_MESSAGE).toHaveLength(280);
      expect(MAX_NEUTRAL_MESSAGE.split(/\s+/u)).toHaveLength(40);

      const result = validateModelDecision(
        { ...createDecision(), message: MAX_NEUTRAL_MESSAGE },
        IDEA_TEXT,
      );

      expect(result.message).toBe(MAX_NEUTRAL_MESSAGE);
    },
  );

  it("accepts a rejection message at the 900-character and 120-word limits", () => {
    expect(MAX_REJECTION_MESSAGE).toHaveLength(900);
    expect(MAX_REJECTION_MESSAGE.split(/\s+/u)).toHaveLength(120);

    const result = validateModelDecision(
      { ...createRejectedDecision(), message: MAX_REJECTION_MESSAGE },
      IDEA_TEXT,
    );

    expect(result.message).toBe(MAX_REJECTION_MESSAGE);
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
            ? { ...item, state: "INDETERMINADO", score: null }
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
