export const EVALUATION_CRITERION_IDS = [
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

export type EvaluationCriterionId = (typeof EVALUATION_CRITERION_IDS)[number];
export type EvaluationDecisionStatus =
  "RECHAZADA" | "SIN_BLOQUEO_EVIDENTE" | "IDEA_INSUFICIENTE";
export type EvaluationTone = "soft" | "hard";
export type EvaluationReasonCode =
  | "PRIVACIDAD_ESTRUCTURAL"
  | "PELIGRO_ESTRUCTURAL"
  | "ETICA_ESTRUCTURAL"
  | "CONTRADICCION_NUCLEO"
  | "HONESTIDAD_ESTRUCTURAL"
  | "CONFLICTO_ESTRUCTURAL"
  | "UTILIDAD_ANULADA"
  | "VALOR_USUARIO_NO_DEFINIDO"
  | "ECONOMIA_INCOMPATIBLE"
  | "HAPPY_PATH_ESTRUCTURAL"
  | "DIFERENCIACION_AUSENTE";

export type EvaluatedCriterion =
  | {
      id: EvaluationCriterionId;
      state: "PUNTUADO";
      score: number;
    }
  | {
      id: EvaluationCriterionId;
      state: "INDETERMINADO" | "NO_APLICA";
      score: null;
    };

export type ModelDecision = {
  status: EvaluationDecisionStatus;
  evaluated: EvaluatedCriterion[];
  stop_at: EvaluationCriterionId | null;
  reason_code: EvaluationReasonCode | null;
  basis: string | null;
  safeTitle: string | null;
  existingProductExample: string | null;
  message: string;
  hardSetup: string | null;
  hardConsequence: string | null;
};

const REASON_CODES_BY_CRITERION: Record<
  EvaluationCriterionId,
  readonly EvaluationReasonCode[]
> = {
  C01: ["PRIVACIDAD_ESTRUCTURAL"],
  C02: ["PELIGRO_ESTRUCTURAL"],
  C03: ["ETICA_ESTRUCTURAL"],
  C04: ["CONTRADICCION_NUCLEO"],
  C05: ["HONESTIDAD_ESTRUCTURAL"],
  C06: ["CONFLICTO_ESTRUCTURAL"],
  C07: ["UTILIDAD_ANULADA", "VALOR_USUARIO_NO_DEFINIDO"],
  C08: ["ECONOMIA_INCOMPATIBLE"],
  C09: ["HAPPY_PATH_ESTRUCTURAL"],
  C10: ["DIFERENCIACION_AUSENTE"],
};
const INVALID_DECISION_MESSAGE = "Respuesta del evaluador no válida.";
const MIN_MESSAGE_WORDS = 8;
const MAX_MESSAGE_WORDS = 40;
const MAX_MESSAGE_LENGTH = 280;
const MAX_REJECTION_MESSAGE_WORDS = 120;
const MAX_REJECTION_MESSAGE_LENGTH = 900;
const MAX_VISIBLE_MESSAGE_LENGTH = 360;
const MAX_VISIBLE_REJECTION_MESSAGE_LENGTH = 1_000;
const MIN_CONCEPTUAL_SCORE = 0;
const MAX_CONCEPTUAL_SCORE = 79;
const REJECTION_THRESHOLD = 15;
const TERMINAL_SENTENCE_MARK = ".";
const DISALLOWED_RESULT_LABEL = /\bbloque(?:o|os|ante|antes)\b/iu;
const MIN_SAFE_TITLE_LENGTH = 8;
const MAX_SAFE_TITLE_LENGTH = 72;
const SAFE_TITLE_WORD_PATTERN = /^[\p{L}\p{N}]+(?:[ '\u2019-][\p{L}\p{N}]+)*$/u;
const SAFE_PRODUCT_EXAMPLE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .&'’()+_-]*$/u;
const MIN_PRODUCT_EXAMPLE_LENGTH = 2;
const MAX_PRODUCT_EXAMPLE_LENGTH = 80;
const EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;
const PHONE_PATTERN = /(?:\+?\d[\d ()-]{7,}\d)/u;
const CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;
const MIN_LITERAL_FRAGMENT_LENGTH = 18;
const INVALID_TONE_MESSAGE = "Tono de evaluación no válido.";
const INVALID_VISIBLE_MESSAGE = "Mensaje visible no válido.";
const HARD_COPY_MIN_LENGTH = 8;
const HARD_COPY_MAX_LENGTH = 140;
const SOFT_MESSAGE_PREFIX =
  "¡Qué ilusión poder acompañarte con todo el cariño! ";
const HARD_REJECTION_MESSAGE_PREFIX =
  "La propuesta se ha pegado un buen batacazo justo en lo esencial: ";
const HARD_CLEAR_MESSAGE_PREFIX = "No hay motivo para celebrar todavía: ";
const HARD_INSUFFICIENT_MESSAGE_PREFIX = "Mucho tráiler, poca película: ";
const INTERNAL_RUBRIC_ALIASES: Record<string, string> = {
  C01: "la privacidad y el acceso a datos",
  C02: "el riesgo de daño grave",
  C03: "el engaño o la explotación",
  C04: "la contradicción o la falta de un mecanismo imprescindible",
  C05: "la confianza en afirmaciones que no se pueden verificar",
  C06: "el conflicto sin una forma de resolverlo",
  C07: "la función que no cumple su promesa",
  C08: "la incompatibilidad entre ingresos y costes",
  C09: "la falta de una alternativa cuando algo falla",
  C10: "la diferencia frente a otras aplicaciones",
  PRIVACIDAD_ESTRUCTURAL: "la privacidad y el acceso a datos",
  PELIGRO_ESTRUCTURAL: "el riesgo de daño grave",
  ETICA_ESTRUCTURAL: "el engaño o la explotación",
  CONTRADICCION_NUCLEO:
    "la contradicción o la falta de un mecanismo imprescindible",
  HONESTIDAD_ESTRUCTURAL:
    "la confianza en afirmaciones que no se pueden verificar",
  CONFLICTO_ESTRUCTURAL: "el conflicto sin una forma de resolverlo",
  UTILIDAD_ANULADA: "la función que no cumple su promesa",
  VALOR_USUARIO_NO_DEFINIDO:
    "la falta de un motivo concreto para usar la aplicación",
  ECONOMIA_INCOMPATIBLE: "la incompatibilidad entre ingresos y costes",
  HAPPY_PATH_ESTRUCTURAL: "la falta de una alternativa cuando algo falla",
  DIFERENCIACION_AUSENTE: "la diferencia frente a otras aplicaciones",
};
const INTERNAL_RUBRIC_ALIAS_SOURCE =
  "C(?:0[1-9]|10)|PRIVACIDAD_ESTRUCTURAL|PELIGRO_ESTRUCTURAL|ETICA_ESTRUCTURAL|CONTRADICCION_NUCLEO|HONESTIDAD_ESTRUCTURAL|CONFLICTO_ESTRUCTURAL|UTILIDAD_ANULADA|VALOR_USUARIO_NO_DEFINIDO|ECONOMIA_INCOMPATIBLE|HAPPY_PATH_ESTRUCTURAL|DIFERENCIACION_AUSENTE";
const INTERNAL_RUBRIC_ALIAS_PATTERN = new RegExp(
  `\\b(?:${INTERNAL_RUBRIC_ALIAS_SOURCE})\\b`,
  "giu",
);
export type ModelDecisionValidationCode =
  | "response_shape"
  | "criteria_prefix"
  | "criterion_value"
  | "decision_fields"
  | "visible_message"
  | "decision_semantics";
const RESULT_HEADLINES: Record<
  EvaluationDecisionStatus,
  Record<EvaluationTone, string>
> = {
  RECHAZADA: {
    soft: "¡Un abrazo y confeti para esta pega importante!",
    hard: "La propuesta se ha estampado contra lo esencial.",
  },
  SIN_BLOQUEO_EVIDENTE: {
    soft: "¡Qué ilusión! Ha superado el primer repaso.",
    hard: "Sigue en pie. No es para celebrarlo.",
  },
  IDEA_INSUFICIENTE: {
    soft: "¡Con cariño y confeti, aún falta aterrizar la idea!",
    hard: "Mucho tráiler; falta la película.",
  },
};

export class InvalidModelDecisionError extends Error {
  constructor(
    readonly validationCode: ModelDecisionValidationCode = "response_shape",
  ) {
    super(INVALID_DECISION_MESSAGE);
    this.name = "InvalidModelDecisionError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCriterionId(value: unknown): value is EvaluationCriterionId {
  return EVALUATION_CRITERION_IDS.some((id) => id === value);
}

function isDecisionStatus(value: unknown): value is EvaluationDecisionStatus {
  return (
    value === "RECHAZADA" ||
    value === "SIN_BLOQUEO_EVIDENTE" ||
    value === "IDEA_INSUFICIENTE"
  );
}

function isReasonCode(value: unknown): value is EvaluationReasonCode {
  return Object.values(REASON_CODES_BY_CRITERION).some((reasonCodes) =>
    reasonCodes.some((reasonCode) => reasonCode === value),
  );
}

function isReasonCodeForCriterion(
  criterionId: EvaluationCriterionId,
  reasonCode: unknown,
): boolean {
  return REASON_CODES_BY_CRITERION[criterionId].some(
    (allowedReasonCode) => allowedReasonCode === reasonCode,
  );
}

function isConceptualScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_CONCEPTUAL_SCORE &&
    value <= MAX_CONCEPTUAL_SCORE
  );
}

function parseEvaluatedCriteria(input: unknown): EvaluatedCriterion[] {
  if (!Array.isArray(input) || input.length > EVALUATION_CRITERION_IDS.length) {
    throw new InvalidModelDecisionError("criteria_prefix");
  }

  return input.map((value: unknown, index) => {
    const expectedId = EVALUATION_CRITERION_IDS[index];
    if (!isRecord(value) || !expectedId || value.id !== expectedId) {
      throw new InvalidModelDecisionError("criteria_prefix");
    }

    if (value.state === "PUNTUADO" && isConceptualScore(value.score)) {
      return { id: expectedId, state: "PUNTUADO", score: value.score };
    }
    if (
      (value.state === "INDETERMINADO" || value.state === "NO_APLICA") &&
      value.score === null
    ) {
      return { id: expectedId, state: value.state, score: null };
    }
    throw new InvalidModelDecisionError("criterion_value");
  });
}

function isValidMessage(
  value: unknown,
  minWords: number,
  maxWords: number,
  maxLength: number,
): value is string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length > maxLength ||
    value.length === 0 ||
    DISALLOWED_RESULT_LABEL.test(value) ||
    /[\r\n\t]/u.test(value) ||
    /^[-*#•]\s/u.test(value) ||
    /^\d+[.)]\s/u.test(value) ||
    !value.endsWith(TERMINAL_SENTENCE_MARK)
  ) {
    return false;
  }

  const sentenceBody = value.slice(0, -TERMINAL_SENTENCE_MARK.length);
  if (/[.!?…]/u.test(sentenceBody)) return false;

  const words = value.split(/\s+/u);
  return words.length >= minWords && words.length <= maxWords;
}

function isValidNeutralMessage(value: unknown): value is string {
  return isValidMessage(
    value,
    MIN_MESSAGE_WORDS,
    MAX_MESSAGE_WORDS,
    MAX_MESSAGE_LENGTH,
  );
}

function isValidRejectionMessage(value: unknown): value is string {
  return isValidMessage(
    value,
    MIN_MESSAGE_WORDS,
    MAX_REJECTION_MESSAGE_WORDS,
    MAX_REJECTION_MESSAGE_LENGTH,
  );
}

function isValidDecisionMessage(
  value: unknown,
  status: EvaluationDecisionStatus,
): value is string {
  return status === "RECHAZADA"
    ? isValidRejectionMessage(value)
    : isValidNeutralMessage(value);
}

function isValidHardCopyComponent(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length >= HARD_COPY_MIN_LENGTH &&
    value.length <= HARD_COPY_MAX_LENGTH &&
    !/[.!?\r\n\t]/u.test(value) &&
    !EMAIL_PATTERN.test(value) &&
    !URL_PATTERN.test(value) &&
    !PHONE_PATTERN.test(value) &&
    !CONTROL_PATTERN.test(value)
  );
}

function renderHardRejectionMessage(decision: ModelDecision): string {
  if (!decision.hardSetup || !decision.hardConsequence) {
    throw new Error(INVALID_VISIBLE_MESSAGE);
  }
  return `${HARD_REJECTION_MESSAGE_PREFIX}${decision.message}`;
}

function removeInternalRubricAliases(message: string): string {
  const messageWithoutCriterionLabels = message.replace(
    new RegExp(
      `\\b(?:el\\s+)?criterio\\s+(${INTERNAL_RUBRIC_ALIAS_SOURCE})\\b`,
      "giu",
    ),
    (_match, alias: string) =>
      INTERNAL_RUBRIC_ALIASES[alias.toUpperCase()] ?? alias,
  );
  return messageWithoutCriterionLabels.replace(
    INTERNAL_RUBRIC_ALIAS_PATTERN,
    (alias) => INTERNAL_RUBRIC_ALIASES[alias.toUpperCase()] ?? alias,
  );
}

function renderHardMessage(decision: ModelDecision): string {
  if (decision.status === "RECHAZADA") {
    return renderHardRejectionMessage(decision);
  }
  if (decision.status === "IDEA_INSUFICIENTE") {
    return `${HARD_INSUFFICIENT_MESSAGE_PREFIX}${decision.message}`;
  }
  return `${HARD_CLEAR_MESSAGE_PREFIX}${decision.message}`;
}

export function renderMessage(decision: unknown, tone: unknown): string {
  if (
    !isRecord(decision) ||
    !isDecisionStatus(decision.status) ||
    !isValidDecisionMessage(decision.message, decision.status)
  ) {
    throw new Error(INVALID_VISIBLE_MESSAGE);
  }
  if (tone !== "soft" && tone !== "hard") {
    throw new Error(INVALID_TONE_MESSAGE);
  }
  const parsedDecision = decision as unknown as ModelDecision;
  if (tone === "soft") {
    const softMessage = `${SOFT_MESSAGE_PREFIX}${parsedDecision.message}`;
    if (
      softMessage.length >
        (parsedDecision.status === "RECHAZADA"
          ? MAX_VISIBLE_REJECTION_MESSAGE_LENGTH
          : MAX_VISIBLE_MESSAGE_LENGTH) ||
      !softMessage.endsWith(".")
    ) {
      throw new Error(INVALID_VISIBLE_MESSAGE);
    }
    return removeInternalRubricAliases(softMessage);
  }
  const hardMessage = renderHardMessage(parsedDecision);
  const maxLength =
    parsedDecision.status === "RECHAZADA"
      ? MAX_VISIBLE_REJECTION_MESSAGE_LENGTH
      : MAX_VISIBLE_MESSAGE_LENGTH;
  if (hardMessage.length > maxLength || !hardMessage.endsWith(".")) {
    throw new Error(INVALID_VISIBLE_MESSAGE);
  }
  if (
    parsedDecision.status === "RECHAZADA" &&
    (!isValidHardCopyComponent(parsedDecision.hardSetup) ||
      !isValidHardCopyComponent(parsedDecision.hardConsequence))
  ) {
    throw new Error(INVALID_VISIBLE_MESSAGE);
  }
  return removeInternalRubricAliases(hardMessage);
}

export function renderHeadline(status: unknown, tone: unknown): string {
  if (!isDecisionStatus(status)) throw new Error(INVALID_VISIBLE_MESSAGE);
  if (tone !== "soft" && tone !== "hard") {
    throw new Error(INVALID_TONE_MESSAGE);
  }
  return RESULT_HEADLINES[status][tone];
}

function parseDecisionFields(
  value: Record<string, unknown>,
): Pick<ModelDecision, "stop_at" | "reason_code" | "basis"> {
  const stopAt = value.stop_at;
  const reasonCode = value.reason_code;
  const basis = value.basis;

  if (stopAt === null && reasonCode === null && basis === null) {
    return { stop_at: null, reason_code: null, basis: null };
  }
  if (
    isCriterionId(stopAt) &&
    isReasonCode(reasonCode) &&
    typeof basis === "string" &&
    basis.trim().length > 0
  ) {
    return { stop_at: stopAt, reason_code: reasonCode, basis };
  }
  throw new InvalidModelDecisionError("decision_fields");
}

function validateRejectedDecision(
  decision: ModelDecision,
  ideaText: string,
): boolean {
  const firstFailure = decision.evaluated.find(
    (criterion) =>
      criterion.state === "PUNTUADO" && criterion.score < REJECTION_THRESHOLD,
  );
  if (
    decision.evaluated.length !== EVALUATION_CRITERION_IDS.length ||
    decision.evaluated.at(-1)?.id !== "C10" ||
    decision.evaluated.at(-1)?.state !== "PUNTUADO" ||
    !firstFailure ||
    decision.stop_at !== firstFailure.id ||
    !isReasonCodeForCriterion(firstFailure.id, decision.reason_code) ||
    decision.basis === null ||
    !ideaText.includes(decision.basis)
  ) {
    return false;
  }
  return true;
}

function isSafeTitle(value: unknown, ideaText: string): value is string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < MIN_SAFE_TITLE_LENGTH ||
    value.length > MAX_SAFE_TITLE_LENGTH ||
    !SAFE_TITLE_WORD_PATTERN.test(value) ||
    EMAIL_PATTERN.test(value) ||
    URL_PATTERN.test(value) ||
    PHONE_PATTERN.test(value) ||
    CONTROL_PATTERN.test(value)
  )
    return false;

  const normalizedTitle = value.toLocaleLowerCase("es-ES");
  const normalizedIdea = ideaText.toLocaleLowerCase("es-ES");
  for (
    let start = 0;
    start <= normalizedTitle.length - MIN_LITERAL_FRAGMENT_LENGTH;
    start += 1
  ) {
    for (
      let length = MIN_LITERAL_FRAGMENT_LENGTH;
      length <= normalizedTitle.length - start;
      length += 1
    ) {
      if (normalizedIdea.includes(normalizedTitle.slice(start, start + length)))
        return false;
    }
  }
  return true;
}

function isValidExistingProductExample(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const normalizedValue = value.toLowerCase();
  return (
    value.trim() === value &&
    value.length >= MIN_PRODUCT_EXAMPLE_LENGTH &&
    value.length <= MAX_PRODUCT_EXAMPLE_LENGTH &&
    normalizedValue !== "null" &&
    normalizedValue !== "undefined" &&
    SAFE_PRODUCT_EXAMPLE_PATTERN.test(value) &&
    !EMAIL_PATTERN.test(value) &&
    !URL_PATTERN.test(value) &&
    !PHONE_PATTERN.test(value) &&
    !CONTROL_PATTERN.test(value)
  );
}

function shouldExposeExistingProductExample(decision: ModelDecision): boolean {
  const c10Criterion = decision.evaluated.at(-1);
  return (
    decision.status === "RECHAZADA" &&
    decision.stop_at === "C10" &&
    decision.reason_code === "DIFERENCIACION_AUSENTE" &&
    c10Criterion?.id === "C10" &&
    c10Criterion.state === "PUNTUADO" &&
    c10Criterion.score < REJECTION_THRESHOLD
  );
}

function isValidDecisionStatus(
  decision: ModelDecision,
  ideaText: string,
): boolean {
  if (decision.status === "RECHAZADA") {
    return (
      isSafeTitle(decision.safeTitle, ideaText) &&
      validateRejectedDecision(decision, ideaText)
    );
  }
  if (
    decision.stop_at !== null ||
    decision.reason_code !== null ||
    decision.basis !== null ||
    decision.safeTitle !== null
  ) {
    return false;
  }
  if (decision.status === "IDEA_INSUFICIENTE") {
    return decision.evaluated.length === 0;
  }
  return (
    decision.evaluated.length === EVALUATION_CRITERION_IDS.length &&
    decision.evaluated.at(-1)?.id === "C10" &&
    decision.evaluated.at(-1)?.state === "PUNTUADO" &&
    decision.evaluated.every(
      (criterion) =>
        criterion.state !== "PUNTUADO" ||
        criterion.score >= REJECTION_THRESHOLD,
    )
  );
}

export function validateModelDecision(
  input: unknown,
  ideaText: unknown,
): ModelDecision {
  if (
    !isRecord(input) ||
    !isDecisionStatus(input.status) ||
    typeof ideaText !== "string"
  ) {
    throw new InvalidModelDecisionError("response_shape");
  }
  const evaluated = parseEvaluatedCriteria(input.evaluated);
  const fields = parseDecisionFields(input);
  const safeTitle = input.safeTitle;
  if (safeTitle !== null && typeof safeTitle !== "string") {
    throw new InvalidModelDecisionError("decision_fields");
  }
  if (!isValidDecisionMessage(input.message, input.status)) {
    throw new InvalidModelDecisionError("visible_message");
  }

  const hardSetup = input.hardSetup;
  const hardConsequence = input.hardConsequence;
  if (
    (hardSetup !== null && typeof hardSetup !== "string") ||
    (hardConsequence !== null && typeof hardConsequence !== "string")
  ) {
    throw new InvalidModelDecisionError("decision_fields");
  }
  if (input.status === "RECHAZADA") {
    if (
      !isValidHardCopyComponent(hardSetup) ||
      !isValidHardCopyComponent(hardConsequence)
    ) {
      throw new InvalidModelDecisionError("visible_message");
    }
  } else if (hardSetup !== null || hardConsequence !== null) {
    throw new InvalidModelDecisionError("decision_fields");
  }

  const decision: ModelDecision = {
    status: input.status,
    evaluated,
    ...fields,
    safeTitle,
    existingProductExample:
      isValidExistingProductExample(input.existingProductExample) &&
      typeof input.existingProductExample === "string"
        ? input.existingProductExample
        : null,
    message: input.message,
    hardSetup,
    hardConsequence,
  };
  if (
    decision.existingProductExample !== null &&
    !shouldExposeExistingProductExample(decision)
  ) {
    decision.existingProductExample = null;
  }
  if (!isValidDecisionStatus(decision, ideaText)) {
    throw new InvalidModelDecisionError("decision_semantics");
  }
  return decision;
}
