import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluationProcess,
  formatEvaluationAlert,
  type EvaluationProcessResult,
} from "./evaluation-process";

const IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const EVALUATION_PATH = "/api/evaluation-process";
const DEMO_RESULT: EvaluationProcessResult = {
  score: 50,
  verdict: "review",
  unknownCriteriaCount: 6,
  isSimulated: true,
  rubricVersion: "v1",
};
const SAFE_FAILURE_MESSAGE = /no se puede verificar/i;

afterEach(() => vi.unstubAllGlobals());

describe("evaluationProcess frontend adapter", () => {
  it("sends the idea to the API and returns its validated scoring", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => DEMO_RESULT,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(evaluationProcess(IDEA_TEXT)).resolves.toEqual(DEMO_RESULT);
    expect(fetchMock).toHaveBeenCalledWith(
      EVALUATION_PATH,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaText: IDEA_TEXT }),
      }),
    );
  });

  it("rejects malformed API results without exposing response data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...DEMO_RESULT, score: 101, leaked: IDEA_TEXT }),
      }),
    );

    await expect(evaluationProcess(IDEA_TEXT)).rejects.toThrow(
      SAFE_FAILURE_MESSAGE,
    );
  });

  it("uses a safe error when the API request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(IDEA_TEXT)));

    await expect(evaluationProcess(IDEA_TEXT)).rejects.toThrow(
      /no se pudo obtener el scoring/i,
    );
  });

  it("formats only score and verdict, explicitly labeling demo results", () => {
    const alertText = formatEvaluationAlert(DEMO_RESULT);

    expect(alertText).toBe(
      "Puntuación de demostración: 50/100 — revisar. El evaluador real aún no está conectado; hay 6 criterios desconocidos.",
    );
    expect(alertText).not.toContain(IDEA_TEXT);
  });
});
