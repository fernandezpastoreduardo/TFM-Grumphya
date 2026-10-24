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
  headline: "Sigue en pie. No es para celebrarlo.",
  message:
    "No hay motivo para celebrar todavía: Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.",
};
const LONG_TONE_RENDERED_MESSAGE = `${"Una explicación clara. ".repeat(13)}Un cierre correcto.`;
const OUTCOME_UNKNOWN_ERROR = {
  code: "EVALUATION_OUTCOME_UNKNOWN",
  message:
    "No hemos podido confirmar si la evaluación terminó. Espera a comprobar el resultado antes de volver a gastar un intento.",
};
const IDEMPOTENCY_KEY = "8a4e1c42-e198-4db3-b4a8-910e25c8b6d1";
const PHONE_LIKE_PRODUCT_EXAMPLE = "+34 600 123 456";

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

  it("preserves an optional known product example from the API", async () => {
    const resultWithExample = {
      ...EVALUATION_RESULT,
      status: "RECHAZADA" as const,
      safeTitle: "Registro deportivo sin propuesta propia",
      existingProductExample: "Strava",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "evaluated", result: resultWithExample }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).resolves.toMatchObject({ existingProductExample: "Strava" });
  });

  it("rejects an existing product example on an evaluation without rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "evaluated",
          result: {
            ...EVALUATION_RESULT,
            existingProductExample: "Strava",
          },
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toMatchObject(OUTCOME_UNKNOWN_ERROR);
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
    ).rejects.toMatchObject(OUTCOME_UNKNOWN_ERROR);
  });

  it("rejects an unsafe known product example from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "evaluated",
          result: {
            ...EVALUATION_RESULT,
            existingProductExample: "https://example.com",
          },
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toMatchObject(OUTCOME_UNKNOWN_ERROR);
  });

  it("rejects a phone number returned as a known product example", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "evaluated",
          result: {
            ...EVALUATION_RESULT,
            status: "RECHAZADA",
            safeTitle: "Registro deportivo sin propuesta propia",
            existingProductExample: PHONE_LIKE_PRODUCT_EXAMPLE,
          },
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toMatchObject(OUTCOME_UNKNOWN_ERROR);
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
    ).rejects.toMatchObject(OUTCOME_UNKNOWN_ERROR);
  });

  it("marks a transport failure as an unknown evaluation outcome", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(IDEA_TEXT)));

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toMatchObject(OUTCOME_UNKNOWN_ERROR);
  });

  it("replaces a confirmed HTTP failure body with a generic safe error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: IDEA_TEXT }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toThrow(
      "No se pudo obtener el scoring. La idea sigue en el formulario; inténtalo otra vez.",
    );
  });

  it("marks an unreadable successful response as an unknown evaluation outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error(IDEA_TEXT);
        },
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toMatchObject(OUTCOME_UNKNOWN_ERROR);
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
      headline: "Mucho tráiler; falta la película.",
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
      headline: "Mucho tráiler; falta la película.",
      message: "Esto todavía no describe una propuesta evaluable.",
    });
  });

  it("accepts the longer public message after the server applies a tone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "evaluated",
          result: { ...EVALUATION_RESULT, message: LONG_TONE_RENDERED_MESSAGE },
        }),
      }),
    );

    await expect(
      evaluationProcess(
        { ideaText: IDEA_TEXT, tone: IDEA_TONE },
        IDEMPOTENCY_KEY,
      ),
    ).resolves.toMatchObject({ message: LONG_TONE_RENDERED_MESSAGE });
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
