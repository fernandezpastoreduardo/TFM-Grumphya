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
  headline: "Bueno, no se ha desmontado a la primera. No te emociones.",
  message:
    "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.",
};
const SAFE_FAILURE_MESSAGE = /no se puede verificar/i;
const IDEMPOTENCY_KEY = "8a4e1c42-e198-4db3-b4a8-910e25c8b6d1";

afterEach(() => vi.unstubAllGlobals());

describe("evaluationProcess frontend adapter", () => {
  it("sends the idea and selected tone and returns the public evaluation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "evaluated", result: EVALUATION_RESULT }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).resolves.toEqual(EVALUATION_RESULT);
    expect(fetchMock).toHaveBeenCalledWith(
      EVALUATION_PATH,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": IDEMPOTENCY_KEY,
        },
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
          status: "evaluated",
          result: {
            ...EVALUATION_RESULT,
            score: 101,
            privateProviderData: IDEA_TEXT,
          },
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toThrow(SAFE_FAILURE_MESSAGE);
  });

  it("rejects a completed functional result without a numeric score", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "evaluated",
          result: { ...EVALUATION_RESULT, score: null },
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toThrow(SAFE_FAILURE_MESSAGE);
  });

  it("uses a safe error when the API request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(IDEA_TEXT)));

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toThrow(/no se pudo obtener el scoring/i);
  });

  it("shows a specific safe message when the evaluator reaches its timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        json: async () => ({
          code: "EVALUATION_TIMEOUT",
          message: IDEA_TEXT,
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toThrow(
      "La evaluación está tardando más de lo previsto. La idea sigue en el formulario; inténtalo de nuevo.",
    );
  });

  it("shows the exhausted lifetime quota message returned by the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          code: "ANONYMOUS_QUOTA_EXHAUSTED",
          scope: "ideas",
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toMatchObject({
      code: "ANONYMOUS_QUOTA_EXHAUSTED",
      message:
        "Has agotado tus tres evaluaciones gratuitas. Consulta los planes para continuar.",
    });
  });

  it("shows a plan-specific exhausted quota message instead of a generic error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          code: "PLAN_QUOTA_EXHAUSTED",
          scope: "ideas",
          remaining: 0,
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toMatchObject({
      code: "PLAN_QUOTA_EXHAUSTED",
      message: "Has agotado las 11 evaluaciones disponibles hoy en Iluminado.",
    });
  });

  it("projects only the public fields and accepts an insufficient result without a score", async () => {
    const publicResult = {
      status: "IDEA_INSUFICIENTE",
      score: null,
      headline: "Esto aún no es una idea; es el tráiler sin película.",
      message: "Esto todavía no describe una propuesta evaluable.",
      basis: IDEA_TEXT,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "evaluated", result: publicResult }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).resolves.toEqual({
      status: "IDEA_INSUFICIENTE",
      score: null,
      headline: "Esto aún no es una idea; es el tráiler sin película.",
      message: "Esto todavía no describe una propuesta evaluable.",
    });
  });

  it("validates a similar rejected idea response and reuses the request key to continue", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "similar_idea_match",
        safeTitle: "Una red social para mascotas",
        submissionCount: 24,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
        true,
      ),
    ).resolves.toEqual({
      status: "similar_idea_match",
      safeTitle: "Una red social para mascotas",
      submissionCount: 24,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      EVALUATION_PATH,
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": IDEMPOTENCY_KEY,
        },
        body: JSON.stringify({
          ...{ ideaText: IDEA_TEXT, tone: IDEA_TONE },
          continueAnyway: true,
        }),
      }),
    );
  });
});
