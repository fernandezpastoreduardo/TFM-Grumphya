import { describe, expect, it, vi } from "vitest";
import { readAiTokenUsage, recordAiOperation } from "./ai-operation.telemetry";

const PRIVATE_TEST_IP = "203.0.113.10";

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

  it("writes only allowlisted operational labels and no per-operation identifier", () => {
    const output = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    recordAiOperation(
      "idea_evaluation",
      "gpt-5.4-mini",
      performance.now(),
      "error",
      {},
      "idea privada: persona@example.test",
    );

    const serialized = String(output.mock.calls.at(-1)?.[0]);
    const event: unknown = JSON.parse(serialized);
    expect(event).toMatchObject({
      type: "ai_operation",
      operation: "idea_evaluation",
      model: "gpt-5.4-mini",
      outcome: "error",
    });
    expect(event).not.toHaveProperty("failureCode");
    expect(event).not.toHaveProperty("traceId");
    expect(serialized).not.toContain("persona@example.test");
    output.mockRestore();
  });

  it("replaces unexpected operation, model and failure labels with safe values", () => {
    const output = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    recordAiOperation(
      `${PRIVATE_TEST_IP}?idea=secreta`,
      PRIVATE_TEST_IP,
      performance.now(),
      "error",
      {},
      "session-123",
    );

    const serialized = String(output.mock.calls.at(-1)?.[0]);
    const event: unknown = JSON.parse(serialized);
    expect(event).toMatchObject({
      operation: "other",
      model: "other",
      outcome: "error",
    });
    expect(event).not.toHaveProperty("failureCode");
    expect(serialized).not.toContain(PRIVATE_TEST_IP);
    expect(serialized).not.toContain("idea=secreta");
    expect(serialized).not.toContain("session-123");
    output.mockRestore();
  });
});
