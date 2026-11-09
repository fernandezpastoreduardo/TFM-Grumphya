import { describe, expect, it } from "vitest";
import { readOpenAiOutputText } from "./read-openai-output-text";

describe("readOpenAiOutputText", () => {
  it("returns the first output text from a valid response", () => {
    expect(
      readOpenAiOutputText({
        output: [
          { content: [{ type: "reasoning", text: "internal" }] },
          { content: [{ type: "output_text", text: "respuesta" }] },
        ],
      }),
    ).toBe("respuesta");
  });

  it("returns null for malformed response shapes", () => {
    expect(readOpenAiOutputText(null)).toBeNull();
    expect(
      readOpenAiOutputText({ output: [{ content: "respuesta" }] }),
    ).toBeNull();
  });
});
