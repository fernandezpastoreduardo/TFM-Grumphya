import type { IdeaTextValidation } from "./models";
import { MAX_IDEA_LENGTH } from "./idea-input-rules";

export function validateIdeaText(input: unknown): IdeaTextValidation {
  if (typeof input !== "string") return { valid: false, reason: "not_text" };

  const value = input.trim();
  if (value.length === 0) return { valid: false, reason: "empty" };
  if (value.length > MAX_IDEA_LENGTH) {
    return { valid: false, reason: "too_long" };
  }

  return { valid: true, value };
}
