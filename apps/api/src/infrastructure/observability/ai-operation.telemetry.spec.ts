import { describe, expect, it } from "vitest";
import { readAiTokenUsage } from "./ai-operation.telemetry";

describe("AI operation token usage", () => {
  it("reads token counts from Responses API usage", () => {
    expect(
      readAiTokenUsage({ usage: { input_tokens: 140, output_tokens: 32 } }),
    ).toEqual({ inputTokens: 140, outputTokens: 32 });
  });

  it("recognizes embeddings prompt tokens and their zero output tokens", () => {
    const response = { usage: { prompt_tokens: 18, total_tokens: 18 } };

    expect(readAiTokenUsage(response)).toEqual({ inputTokens: 18 });
    expect(readAiTokenUsage(response, true)).toEqual({
      inputTokens: 18,
      outputTokens: 0,
    });
  });

  it("ignores missing, negative, fractional and unexpected token counts", () => {
    expect(readAiTokenUsage(null)).toEqual({});
    expect(
      readAiTokenUsage({ usage: { input_tokens: -1, output_tokens: 2.5 } }),
    ).toEqual({});
  });
});
