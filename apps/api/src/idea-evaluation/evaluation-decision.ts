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
  | "ECONOMIA_INCOMPATIBLE"
  | "HAPPY_PATH_ESTRUCTURAL";

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
  message: string;
};

const REASON_CODE_BY_CRITERION: Record<
  EvaluationCriterionId,
  EvaluationReasonCode
> = {
  C01: "PRIVACIDAD_ESTRUCTURAL",
  C02: "PELIGRO_ESTRUCTURAL",
  C03: "ETICA_ESTRUCTURAL",
  C04: "CONTRADICCION_NUCLEO",
  C05: "HONESTIDAD_ESTRUCTURAL",
  C06: "CONFLICTO_ESTRUCTURAL",
  C07: "UTILIDAD_ANULADA",
  C08: "ECONOMIA_INCOMPATIBLE",
  C09: "HAPPY_PATH_ESTRUCTURAL",
};
const INVALID_DECISION_MESSAGE = "Respuesta del evaluador no válida.";
const MIN_MESSAGE_WORDS = 8;
const MAX_MESSAGE_WORDS = 40;
const MAX_MESSAGE_LENGTH = 280;
const MIN_CONCEPTUAL_SCORE = 0;
const MAX_CONCEPTUAL_SCORE = 79;
const REJECTION_THRESHOLD = 15;
const TERMINAL_SENTENCE_MARK = ".";
const DISALLOWED_RESULT_LABEL = /\bbloque(?:o|os|ante|antes)\b/iu;
const INVALID_TONE_MESSAGE = "Tono de evaluación no válido.";
const INVALID_VISIBLE_MESSAGE = "Mensaje visible no válido.";
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
    soft: "Vaya, justo falla donde más importa.",
    hard: "Pues… no decepciona; no esperaba gran cosa.",
  },
  SIN_BLOQUEO_EVIDENTE: {
    soft: "Bueno, de momento no se cae por lo más obvio.",
    hard: "Bueno, no se ha desmontado a la primera. No te emociones.",
  },
  IDEA_INSUFICIENTE: {
    soft: "Por ahora solo hay una pista, no una propuesta.",
    hard: "Esto aún no es una idea; es el tráiler sin película.",
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
  return Object.values(REASON_CODE_BY_CRITERION).some(
    (reasonCode) => reasonCode === value,
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

export function renderMessage(decision: unknown): string {
  if (!isRecord(decision) || !isValidNeutralMessage(decision.message)) {
    throw new Error(INVALID_VISIBLE_MESSAGE);
  }
  return decision.message;
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
  const lastEvaluated = decision.evaluated.at(-1);
  if (
    !lastEvaluated ||
    lastEvaluated.state !== "PUNTUADO" ||
    lastEvaluated.score >= REJECTION_THRESHOLD ||
    decision.stop_at !== lastEvaluated.id ||
    decision.reason_code !== REASON_CODE_BY_CRITERION[lastEvaluated.id] ||
    decision.basis === null ||
    !ideaText.includes(decision.basis)
  ) {
    return false;
  }

  return decision.evaluated
    .slice(0, -1)
    .every(
      (criterion) =>
        criterion.state !== "PUNTUADO" ||
        criterion.score >= REJECTION_THRESHOLD,
    );
}

function isValidDecisionStatus(
  decision: ModelDecision,
  ideaText: string,
): boolean {
  if (decision.status === "RECHAZADA") {
    return validateRejectedDecision(decision, ideaText);
  }
  if (
    decision.stop_at !== null ||
    decision.reason_code !== null ||
    decision.basis !== null
  ) {
    return false;
  }
  if (decision.status === "IDEA_INSUFICIENTE") {
    return decision.evaluated.length === 0;
  }
  return (
    decision.evaluated.length === EVALUATION_CRITERION_IDS.length &&
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
  if (!isValidNeutralMessage(input.message)) {
    throw new InvalidModelDecisionError("visible_message");
  }

  const decision: ModelDecision = {
    status: input.status,
    evaluated,
    ...fields,
    message: input.message,
  };
  if (!isValidDecisionStatus(decision, ideaText)) {
    throw new InvalidModelDecisionError("decision_semantics");
  }
  return decision;
}
