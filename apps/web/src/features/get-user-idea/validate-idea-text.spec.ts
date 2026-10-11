import { describe, expect, it } from "vitest";
import { MAX_IDEA_LENGTH, MIN_IDEA_LENGTH } from "./idea-input-rules";
import { validateIdeaText } from "./validate-idea-text";

describe("validateIdeaText", () => {
  it("rejects values that are not strings at runtime", () => {
    expect(validateIdeaText(null)).toEqual({
      valid: false,
      reason: "not_text",
    });
    expect(validateIdeaText({ ideaText: "texto" })).toEqual({
      valid: false,
      reason: "not_text",
    });
  });

  it("rejects empty text and text shorter than the minimum after trimming", () => {
    expect(validateIdeaText(" \n ")).toEqual({ valid: false, reason: "empty" });
    expect(validateIdeaText(" 123456789 ")).toEqual({
      valid: false,
      reason: "too_short",
    });
  });

  it("accepts trimmed text at the minimum and maximum lengths", () => {
    expect(validateIdeaText(` ${"a".repeat(MIN_IDEA_LENGTH)} `)).toEqual({
      valid: true,
      value: "a".repeat(MIN_IDEA_LENGTH),
    });
    expect(validateIdeaText("b".repeat(MAX_IDEA_LENGTH))).toEqual({
      valid: true,
      value: "b".repeat(MAX_IDEA_LENGTH),
    });
  });

  it("rejects text beyond the maximum length", () => {
    expect(validateIdeaText("c".repeat(MAX_IDEA_LENGTH + 1))).toEqual({
      valid: false,
      reason: "too_long",
    });
  });
});
