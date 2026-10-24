export type ApplicationErrorContext = {
  useCase: "idea_evaluation";
  inputText: string;
};

const MAX_STORED_IDEA_TEXT_LENGTH = 2_000;

export function parseApplicationErrorContext(
  value: unknown,
): ApplicationErrorContext | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const context = value as Record<string, unknown>;
  if (
    context.useCase !== "idea_evaluation" ||
    typeof context.inputText !== "string" ||
    context.inputText.length > MAX_STORED_IDEA_TEXT_LENGTH
  ) {
    return null;
  }
  return { useCase: "idea_evaluation", inputText: context.inputText };
}
