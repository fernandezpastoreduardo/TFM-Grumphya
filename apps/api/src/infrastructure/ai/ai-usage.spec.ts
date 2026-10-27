import { describe, expect, it } from "vitest";
import { calculateEstimatedCostUsd, readTokenUsage } from "./ai-usage";

describe("AI usage metrics", () => {
  it("estimates provider costs from token usage without storing request text", () => {
    expect(
      calculateEstimatedCostUsd("gpt-5.4-mini", 1_000_000, 1_000_000),
    ).toBe(5.25);
    expect(
      calculateEstimatedCostUsd("text-embedding-3-small", 1_000_000, 0),
    ).toBe(0.02);
  });

  it("marks unknown model prices and malformed usage as unpriced", () => {
    expect(calculateEstimatedCostUsd("future-model", 10, 10)).toBeNull();
    expect(
      readTokenUsage({ usage: { input_tokens: 2, output_tokens: 3 } }),
    ).toEqual({
      inputTokens: 2,
      outputTokens: 3,
    });
    expect(
      readTokenUsage({ usage: { input_tokens: -1, output_tokens: 3 } }),
    ).toBeNull();
    expect(readTokenUsage({ usage: "secret payload" })).toBeNull();
  });

  it.each([
    { input_tokens: 1.5, output_tokens: 3 },
    { input_tokens: 2, output_tokens: -1 },
    { input_tokens: Number.MAX_SAFE_INTEGER + 1, output_tokens: 3 },
  ])("rejects unsafe or negative token counts: %j", (usage) => {
    expect(readTokenUsage({ usage })).toBeNull();
  });
});
