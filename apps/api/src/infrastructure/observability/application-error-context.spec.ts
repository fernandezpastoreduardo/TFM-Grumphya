import { describe, expect, it } from "vitest";
import { parseApplicationErrorContext } from "./application-error-context";

const MAX_STORED_IDEA_TEXT_LENGTH = 2_000;
const IDEA_TEXT = "Una app para evaluar ideas";

describe("parseApplicationErrorContext", () => {
  it("keeps only the supported evaluation fields", () => {
    expect(
      parseApplicationErrorContext({
        useCase: "idea_evaluation",
        inputText: IDEA_TEXT,
        privateData: "drop this",
      }),
    ).toEqual({ useCase: "idea_evaluation", inputText: IDEA_TEXT });
  });

  it.each([
    null,
    [],
    { useCase: "roast", inputText: IDEA_TEXT },
    { useCase: "idea_evaluation", inputText: 42 },
    {
      useCase: "idea_evaluation",
      inputText: "x".repeat(MAX_STORED_IDEA_TEXT_LENGTH + 1),
    },
  ])("rejects unsupported or oversized contexts: %s", (context) => {
    expect(parseApplicationErrorContext(context)).toBeNull();
  });
});
