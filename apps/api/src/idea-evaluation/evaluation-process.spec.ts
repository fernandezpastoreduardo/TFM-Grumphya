import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { normalizeAndValidateRequest } from "./evaluation-process";
import { EvaluationProcessService } from "./evaluation-process.service";

const VALID_IDEA = "Una app para coordinar voluntarios en el barrio";
const VALID_REQUEST = { ideaText: VALID_IDEA, tone: "soft" };

describe("evaluation request validation", () => {
  it.each([
    null,
    42,
    { ideaText: "corta", tone: "soft" },
    { ideaText: "a".repeat(2001), tone: "soft" },
    { ideaText: VALID_IDEA, tone: "angry" },
    { ideaText: VALID_IDEA, tone: 42 },
  ])("rejects invalid request input without echoing it", (input) => {
    expect(() => normalizeAndValidateRequest(input)).toThrow(/idea no válida/i);
    try {
      normalizeAndValidateRequest(input);
    } catch (error) {
      expect(String(error)).not.toContain(String(input));
    }
  });

  it.each(["a".repeat(10), "a".repeat(2000)])(
    "accepts idea text at the %s-character boundary",
    (ideaText) => {
      expect(normalizeAndValidateRequest({ ideaText, tone: "hard" })).toEqual({
        ideaText,
        tone: "hard",
      });
    },
  );

  it("trims valid idea text", () => {
    expect(
      normalizeAndValidateRequest({
        ...VALID_REQUEST,
        ideaText: `  ${VALID_IDEA}  `,
      }),
    ).toEqual(VALID_REQUEST);
  });

  it("returns a generic client error for invalid API input", async () => {
    const service = new EvaluationProcessService();
    let thrown: unknown;
    try {
      await service.evaluate({ ideaText: "corta", tone: "soft" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    if (thrown instanceof BadRequestException) {
      expect(thrown.getResponse()).toEqual({
        code: "INVALID_IDEA",
        message:
          "La idea debe tener entre 10 y 2.000 caracteres y un tono válido.",
      });
    }
  });
});
