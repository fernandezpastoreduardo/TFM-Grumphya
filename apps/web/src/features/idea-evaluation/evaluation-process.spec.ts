import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluationProcess,
  type EvaluationProcessResult,
} from "./evaluation-process";
import type { IdeaTone } from "../get-user-idea/models";

const IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const IDEA_TONE: IdeaTone = "hard";
const EVALUATION_PATH = "/api/evaluation-process";
const EVALUATION_RESULT: EvaluationProcessResult = {
  status: "SIN_BLOQUEO_EVIDENTE",
  score: 7.15,
  message:
    "Menudo plan: Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.",
};
const SAFE_FAILURE_MESSAGE = /no se puede verificar/i;

afterEach(() => vi.unstubAllGlobals());

describe("evaluationProcess frontend adapter", () => {
  it("sends the idea and selected tone and returns the public evaluation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => EVALUATION_RESULT,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      evaluationProcess({ ideaText: IDEA_TEXT, tone: IDEA_TONE }),
    ).resolves.toEqual(EVALUATION_RESULT);
    expect(fetchMock).toHaveBeenCalledWith(
      EVALUATION_PATH,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaText: IDEA_TEXT, tone: IDEA_TONE }),
      }),
    );
  });

  it("rejects malformed API results without exposing response data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...EVALUATION_RESULT,
          score: 101,
          privateProviderData: IDEA_TEXT,
        }),
      }),
    );

    await expect(
      evaluationProcess({ ideaText: IDEA_TEXT, tone: IDEA_TONE }),
    ).rejects.toThrow(SAFE_FAILURE_MESSAGE);
  });

  it("uses a safe error when the API request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(IDEA_TEXT)));

    await expect(
      evaluationProcess({ ideaText: IDEA_TEXT, tone: IDEA_TONE }),
    ).rejects.toThrow(/no se pudo obtener el scoring/i);
  });

  it("projects only the public fields and accepts an insufficient result without a score", async () => {
    const publicResult = {
      status: "IDEA_INSUFICIENTE",
      score: null,
      message: "Cuéntame qué haría la app y para quién.",
      basis: IDEA_TEXT,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => publicResult,
      }),
    );

    await expect(
      evaluationProcess({ ideaText: IDEA_TEXT, tone: IDEA_TONE }),
    ).resolves.toEqual({
      status: "IDEA_INSUFICIENTE",
      score: null,
      message: "Cuéntame qué haría la app y para quién.",
    });
  });
});
