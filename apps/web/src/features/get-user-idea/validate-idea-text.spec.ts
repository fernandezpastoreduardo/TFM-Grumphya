import { describe, expect, it } from "vitest";
import { MAX_IDEA_LENGTH } from "./idea-input-rules";
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

  it("rejects empty text after trimming", () => {
    expect(validateIdeaText(" \n ")).toEqual({ valid: false, reason: "empty" });
  });

  it("accepts trimmed text below the server minimum and at the maximum", () => {
    expect(validateIdeaText(" 123456789 ")).toEqual({
      valid: true,
      value: "123456789",
    });
    expect(validateIdeaText("b".repeat(MAX_IDEA_LENGTH))).toEqual({
      valid: true,
      value: "b".repeat(MAX_IDEA_LENGTH),
    });
  });

  it("accepts non-empty short text so the server can classify special cases", () => {
    expect(validateIdeaText("hola")).toEqual({ valid: true, value: "hola" });
  });

  it("rejects text beyond the maximum length", () => {
    expect(validateIdeaText("c".repeat(MAX_IDEA_LENGTH + 1))).toEqual({
      valid: false,
      reason: "too_long",
    });
  });
});
