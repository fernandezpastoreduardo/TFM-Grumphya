export const EVALUATION_RUBRIC = [
  { key: "problem-user", weight: 25 },
  { key: "differentiation", weight: 15 },
  { key: "acquisition", weight: 15 },
  { key: "feasibility", weight: 20 },
  { key: "economics", weight: 15 },
  { key: "privacy-compliance", weight: 10 },
] as const;

export type CriterionKey = (typeof EVALUATION_RUBRIC)[number]["key"];
export type EvaluationVerdict = "reject" | "review" | "promising";
export type EvaluationTone = "soft" | "hard";
export type EvaluationRequest = { ideaText: string; tone: EvaluationTone };

export type EvaluationCriterion = {
  key: CriterionKey;
  rating: 0 | 1 | 2 | 3 | 4;
  weight: number;
  reason: string;
  isUnknown: boolean;
};

export type EvaluationScore = {
  score: number;
  verdict: EvaluationVerdict;
  criteria: EvaluationCriterion[];
  unknownCriteriaCount: number;
};

export type EvaluationProcessResult = EvaluationScore & {
  isSimulated: true;
  rubricVersion: "v1";
};

const MIN_IDEA_LENGTH = 10;
const MAX_IDEA_LENGTH = 2000;
const INVALID_CRITERIA_MESSAGE = "Criterios de evaluación no válidos.";
const INVALID_IDEA_MESSAGE = "Idea no válida para evaluación.";
const DEMO_UNKNOWN_RATING = 2;
const DEMO_UNKNOWN_REASON =
  "Criterio sin datos: el evaluador aún no está conectado.";
const DEMO_RATINGS: EvaluationCriterion[] = EVALUATION_RUBRIC.map(
  ({ key, weight }) => ({
    key,
    weight,
    rating: DEMO_UNKNOWN_RATING,
    reason: DEMO_UNKNOWN_REASON,
    isUnknown: true,
  }),
);

export class InvalidEvaluationInputError extends Error {
  constructor() {
    super(INVALID_IDEA_MESSAGE);
    this.name = "InvalidEvaluationInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCriterionKey(value: unknown): value is CriterionKey {
  return EVALUATION_RUBRIC.some((criterion) => criterion.key === value);
}

function isRating(value: unknown): value is EvaluationCriterion["rating"] {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 4
  );
}

function parseEvaluationCriteria(input: unknown): EvaluationCriterion[] {
  if (!Array.isArray(input) || input.length !== EVALUATION_RUBRIC.length) {
    throw new Error(INVALID_CRITERIA_MESSAGE);
  }

  const parsedCriteria: EvaluationCriterion[] = [];
  const seenKeys = new Set<CriterionKey>();
  const rawCriteria: unknown[] = input;

  for (const value of rawCriteria) {
    if (!isRecord(value) || !isCriterionKey(value.key)) {
      throw new Error(INVALID_CRITERIA_MESSAGE);
    }

    const rubricCriterion = EVALUATION_RUBRIC.find(
      (criterion) => criterion.key === value.key,
    );
    if (
      !rubricCriterion ||
      seenKeys.has(value.key) ||
      value.weight !== rubricCriterion.weight ||
      !isRating(value.rating) ||
      typeof value.reason !== "string" ||
      typeof value.isUnknown !== "boolean"
    ) {
      throw new Error(INVALID_CRITERIA_MESSAGE);
    }

    seenKeys.add(value.key);
    parsedCriteria.push({
      key: value.key,
      rating: value.rating,
      weight: rubricCriterion.weight,
      reason: value.reason,
      isUnknown: value.isUnknown,
    });
  }

  return parsedCriteria;
}

function getVerdict(
  score: number,
  unknownCriteriaCount: number,
): EvaluationVerdict {
  if (score < 40) return "reject";
  if (score < 70 || unknownCriteriaCount >= 2) return "review";
  return "promising";
}

export function calculateEvaluationScore(input: unknown): EvaluationScore {
  const criteria = parseEvaluationCriteria(input);
  const weightedScore = criteria.reduce(
    (total, criterion) => total + (criterion.weight * criterion.rating) / 4,
    0,
  );
  const score = Math.round(weightedScore);
  const unknownCriteriaCount = criteria.filter(
    (criterion) => criterion.isUnknown,
  ).length;

  return {
    score,
    verdict: getVerdict(score, unknownCriteriaCount),
    criteria,
    unknownCriteriaCount,
  };
}

export function normalizeAndValidateRequest(input: unknown): EvaluationRequest {
  if (
    !isRecord(input) ||
    typeof input.ideaText !== "string" ||
    (input.tone !== "soft" && input.tone !== "hard")
  ) {
    throw new InvalidEvaluationInputError();
  }

  const ideaText = input.ideaText.trim();
  if (ideaText.length < MIN_IDEA_LENGTH || ideaText.length > MAX_IDEA_LENGTH) {
    throw new InvalidEvaluationInputError();
  }
  return { ideaText, tone: input.tone };
}

export function evaluationProcess(input: unknown): EvaluationProcessResult {
  normalizeAndValidateRequest(input);
  return {
    ...calculateEvaluationScore(DEMO_RATINGS),
    isSimulated: true,
    rubricVersion: "v1",
  };
}
