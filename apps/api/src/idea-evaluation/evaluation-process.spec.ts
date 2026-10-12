import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  calculateEvaluationScore,
  EVALUATION_RUBRIC,
  evaluationProcess,
} from "./evaluation-process";
import { EvaluationProcessService } from "./evaluation-process.service";

const VALID_IDEA = "Una app para coordinar voluntarios en el barrio";
const VALID_REQUEST = { ideaText: VALID_IDEA, tone: "soft" };
const UNSAFE_IDEA = '<script>alert("idea privada")</script>';
const INVALID_CRITERIA_MESSAGE = /criterios de evaluación no válidos/i;

function createRatings(rating: number, unknownCount = 0) {
  return EVALUATION_RUBRIC.map((criterion, index) => ({
    key: criterion.key,
    rating,
    weight: criterion.weight,
    reason: "Información de ejemplo.",
    isUnknown: index < unknownCount,
  }));
}

function createRatingsFromValues(ratings: number[]) {
  return EVALUATION_RUBRIC.map((criterion, index) => ({
    key: criterion.key,
    rating: ratings[index],
    weight: criterion.weight,
    reason: "Información de ejemplo.",
    isUnknown: false,
  }));
}

describe("evaluationProcess API use case", () => {
  it("returns a clearly simulated score using the v1 rubric", () => {
    const result = evaluationProcess(VALID_REQUEST);

    expect(result).toMatchObject({
      score: 50,
      verdict: "review",
      isSimulated: true,
      unknownCriteriaCount: 6,
      rubricVersion: "v1",
    });
    expect(result.criteria).toHaveLength(6);
    expect(result.criteria.every((criterion) => criterion.isUnknown)).toBe(
      true,
    );
  });

  it("does not echo idea text or markup in its response", () => {
    const result = evaluationProcess({ ideaText: UNSAFE_IDEA, tone: "soft" });
    const serializedResult = JSON.stringify(result);

    expect(serializedResult).not.toContain(UNSAFE_IDEA);
    expect(serializedResult).not.toContain("<script>");
  });

  it("calculates weighted ratings in the 0–100 range", () => {
    expect(calculateEvaluationScore(createRatings(0))).toMatchObject({
      score: 0,
      verdict: "reject",
    });
    expect(calculateEvaluationScore(createRatings(4))).toMatchObject({
      score: 100,
      verdict: "promising",
    });
  });

  it.each([
    { ratings: [0, 0, 0, 4, 3, 3], score: 39, verdict: "reject" },
    { ratings: [0, 0, 0, 3, 4, 4], score: 40, verdict: "review" },
    { ratings: [0, 3, 4, 4, 4, 3], score: 69, verdict: "review" },
    { ratings: [0, 4, 4, 3, 4, 4], score: 70, verdict: "promising" },
  ])(
    "applies v1 verdict boundaries at $score",
    ({ ratings, score, verdict }) => {
      expect(
        calculateEvaluationScore(createRatingsFromValues(ratings)),
      ).toMatchObject({ score, verdict });
    },
  );

  it("caps the verdict at review if two or more criteria are unknown", () => {
    expect(calculateEvaluationScore(createRatings(4, 2))).toMatchObject({
      score: 100,
      verdict: "review",
      unknownCriteriaCount: 2,
    });
  });

  it.each([
    null,
    [],
    createRatings(5),
    [...createRatings(3).slice(1), createRatings(3)[1]],
    createRatings(3).map((criterion, index) =>
      index === 0 ? { ...criterion, weight: 15 } : criterion,
    ),
    createRatings(3).map((criterion, index) =>
      index === 0 ? { ...criterion, key: "unexpected" } : criterion,
    ),
  ])("rejects invalid evaluator output", (input) => {
    expect(() => calculateEvaluationScore(input)).toThrow(
      INVALID_CRITERIA_MESSAGE,
    );
  });

  it.each([
    null,
    42,
    { ideaText: "corta", tone: "soft" },
    { ideaText: "a".repeat(2001), tone: "soft" },
    { ideaText: VALID_IDEA, tone: "angry" },
    { ideaText: VALID_IDEA, tone: 42 },
  ])("rejects invalid request input without echoing it", (input) => {
    expect(() => evaluationProcess(input)).toThrow(/idea no válida/i);
    try {
      evaluationProcess(input);
    } catch (error) {
      expect(String(error)).not.toContain(String(input));
    }
  });

  it.each(["a".repeat(10), "a".repeat(2000)])(
    "accepts idea text at the %s-character boundary",
    (ideaText) => {
      expect(() => evaluationProcess({ ideaText, tone: "hard" })).not.toThrow();
    },
  );

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
