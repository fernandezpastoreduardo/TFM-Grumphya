export type EvaluationTone = "soft" | "hard";
export type EvaluationRequest = { ideaText: string; tone: EvaluationTone };

export const MIN_IDEA_LENGTH = 10;
export const MAX_IDEA_LENGTH = 2000;
const INVALID_IDEA_MESSAGE = "Idea no válida para evaluación.";

export class InvalidEvaluationInputError extends Error {
  constructor() {
    super(INVALID_IDEA_MESSAGE);
    this.name = "InvalidEvaluationInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
