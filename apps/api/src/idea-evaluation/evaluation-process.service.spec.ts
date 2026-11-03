import {
  BadRequestException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import type { ModelDecision } from "./evaluation-decision";
import type { EvaluationPort } from "./evaluation-port";
import { OpenAiEvaluationFailure } from "./openai-evaluation.port";
import { EvaluationTestingModule } from "./evaluation-testing.module";
import { FakeEvaluationPort } from "./fake-evaluation.port";
import { EvaluationProcessService } from "./evaluation-process.service";

const VALID_IDEA = "Una app para coordinar voluntarios en el barrio";
const REJECTED_IDEA =
  "Accedemos sin autorización a datos personales para ofrecer una app de coordinación.";
const LOW_VALUE_METRIC_IDEA =
  "Una app para contar cuántas veces alguien se ata los cordones.";
const LOW_VALUE_METRIC_BASIS =
  "contar cuántas veces alguien se ata los cordones";
const GENERIC_TRAINING_LOG_IDEA =
  "Una app que sirva para registrar entrenamientos";
const POLICY_VERSION = "grumphya-concept-v10";
const NEUTRAL_MESSAGE =
  "La idea concreta ofrece una utilidad reconocible para quien necesita organizar este trabajo. Sin embargo, la descripción no explica cómo se comprueba que el resultado sea correcto ni cómo se distingue de otras opciones. Conviene validar primero esa diferencia y la confianza en el material final.";
const REJECTION_MESSAGE =
  "Acceder sin autorización a datos personales convierte el servicio en una invasión directa de la privacidad de sus usuarios.";
const HARD_SETUP = "un servicio que accede a datos personales sin permiso";
const HARD_CONSEQUENCE = "los usuarios pierden el control de su información";
const SOFT_MESSAGE_PREFIX =
  "¡Qué ilusión poder acompañarte con todo el cariño! ";
const HARD_CLEAR_MESSAGE_PREFIX = "No hay motivo para celebrar todavía: ";
const HARD_REJECTION_MESSAGE_PREFIX =
  "La propuesta se ha pegado un buen batacazo justo en lo esencial: ";
const EXPECTED_NEUTRAL_RESULT = {
  status: "SIN_BLOQUEO_EVIDENTE",
  score: 7.13,
  headline: "La idea pasa este primer repaso, con confeti prudente.",
  message: `${HARD_CLEAR_MESSAGE_PREFIX}${NEUTRAL_MESSAGE}`,
};
const UNAVAILABLE_RESPONSE = {
  code: "EVALUATOR_UNAVAILABLE",
  message: "El servicio de evaluación no está disponible ahora.",
};
const INVALID_RESPONSE = {
  code: "INVALID_EVALUATION_RESPONSE",
  message: "No se ha podido evaluar la idea ahora.",
};
const TIMEOUT_RESPONSE = {
  code: "EVALUATION_TIMEOUT",
  message: "La evaluación ha tardado demasiado. Inténtalo más tarde.",
};

function expectExceptionNotToRetainIdea(exception: unknown) {
  expect(exception).not.toHaveProperty("applicationErrorContext");
  expect(JSON.stringify(exception ?? null)).not.toContain(VALID_IDEA);
}

function createCompleteDecision(): ModelDecision {
  return {
    status: "SIN_BLOQUEO_EVIDENTE",
    headline: "La idea pasa este primer repaso, con confeti prudente.",
    evaluated: [
      { id: "C01", state: "PUNTUADO", score: 71 },
      { id: "C02", state: "PUNTUADO", score: 72 },
      { id: "C03", state: "INDETERMINADO", score: null },
      { id: "C04", state: "INDETERMINADO", score: null },
      { id: "C05", state: "NO_APLICA", score: null },
      { id: "C06", state: "INDETERMINADO", score: null },
      { id: "C07", state: "NO_APLICA", score: null },
      { id: "C08", state: "INDETERMINADO", score: null },
      { id: "C09", state: "NO_APLICA", score: null },
      { id: "C10", state: "PUNTUADO", score: 71 },
    ],
    stop_at: null,
    reason_code: null,
    basis: null,
    safeTitle: null,
    existingProductExample: null,
    message: NEUTRAL_MESSAGE,
    hardSetup: null,
    hardConsequence: null,
  };
}

function createRejectedDecision(): ModelDecision {
  return {
    status: "RECHAZADA",
    headline: "Esta idea necesita un cambio de rumbo.",
    evaluated: [
      { id: "C01", state: "PUNTUADO", score: 13 },
      { id: "C02", state: "PUNTUADO", score: 50 },
      { id: "C03", state: "PUNTUADO", score: 50 },
      { id: "C04", state: "PUNTUADO", score: 50 },
      { id: "C05", state: "PUNTUADO", score: 50 },
      { id: "C06", state: "PUNTUADO", score: 50 },
      { id: "C07", state: "PUNTUADO", score: 50 },
      { id: "C08", state: "PUNTUADO", score: 50 },
      { id: "C09", state: "PUNTUADO", score: 50 },
      { id: "C10", state: "PUNTUADO", score: 60 },
    ],
    stop_at: "C01",
    reason_code: "PRIVACIDAD_ESTRUCTURAL",
    basis: "sin autorización",
    safeTitle: "Riesgo de privacidad sin mitigaciones",
    existingProductExample: null,
    message: REJECTION_MESSAGE,
    hardSetup: HARD_SETUP,
    hardConsequence: HARD_CONSEQUENCE,
  };
}

function createExistingProductDecision(): ModelDecision {
  return {
    ...createCompleteDecision(),
    status: "RECHAZADA",
    evaluated: createCompleteDecision().evaluated.map((criterion) =>
      criterion.id === "C10"
        ? { id: "C10", state: "PUNTUADO", score: 10 }
        : criterion,
    ),
    stop_at: "C10",
    reason_code: "DIFERENCIACION_AUSENTE",
    basis: "registrar entrenamientos",
    safeTitle: "Registro deportivo sin propuesta propia",
    existingProductExample: "Strava",
    message:
      "Registrar entrenamientos ya es una función habitual y la idea no ofrece un motivo concreto para elegirla frente a las opciones conocidas.",
    hardSetup:
      "una app que solo registra entrenamientos sin aportar algo propio",
    hardConsequence:
      "el usuario no obtiene un motivo para cambiar de aplicación",
  };
}

function createUndefinedUserValueDecision(): ModelDecision {
  return {
    status: "RECHAZADA",
    headline: "El contador se queda sin motivo de uso.",
    evaluated: [
      { id: "C01", state: "PUNTUADO", score: 60 },
      { id: "C02", state: "PUNTUADO", score: 60 },
      { id: "C03", state: "PUNTUADO", score: 60 },
      { id: "C04", state: "PUNTUADO", score: 60 },
      { id: "C05", state: "PUNTUADO", score: 60 },
      { id: "C06", state: "PUNTUADO", score: 60 },
      { id: "C07", state: "PUNTUADO", score: 10 },
      { id: "C08", state: "PUNTUADO", score: 60 },
      { id: "C09", state: "PUNTUADO", score: 60 },
      { id: "C10", state: "PUNTUADO", score: 79 },
    ],
    stop_at: "C07",
    reason_code: "VALOR_USUARIO_NO_DEFINIDO",
    basis: LOW_VALUE_METRIC_BASIS,
    safeTitle: "Contador sin beneficio para quien lo usa",
    existingProductExample: null,
    message:
      "La idea solo cuenta una acción, pero no define qué problema resuelve ni qué resultado obtiene alguien, así que no ofrece un motivo concreto para empezar o seguir usando la aplicación.",
    hardSetup: "una app que cuenta una acción sin explicar para qué sirve",
    hardConsequence: "el usuario no obtiene un resultado que le importe",
  };
}

function createInsufficientDecision(): ModelDecision {
  return {
    status: "IDEA_INSUFICIENTE",
    headline: "Faltan piezas para valorar esta idea.",
    evaluated: [],
    stop_at: null,
    reason_code: null,
    basis: null,
    safeTitle: null,
    existingProductExample: null,
    message:
      "Esto todavía no describe una idea evaluable; hay más misterio que producto y eso no ayuda a puntuarlo.",
    hardSetup: null,
    hardConsequence: null,
  };
}

function createPort(result: unknown): EvaluationPort {
  return {
    evaluate: vi.fn().mockResolvedValue(result),
  };
}

function getExceptionResponse(error: unknown): unknown {
  if (
    error instanceof BadRequestException ||
    error instanceof GatewayTimeoutException ||
    error instanceof ServiceUnavailableException
  ) {
    return error.getResponse();
  }
  return null;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("EvaluationProcessService", () => {
  it("sends the selected tone to the evaluation port", async () => {
    const port = createPort(createCompleteDecision());
    const service = new EvaluationProcessService(port);

    await service.evaluate({ ideaText: VALID_IDEA, tone: "hard" });

    expect(port.evaluate).toHaveBeenCalledTimes(1);
    expect(port.evaluate).toHaveBeenCalledWith({
      ideaText: VALID_IDEA,
      tone: "hard",
      policyVersion: POLICY_VERSION,
      signal: expect.any(AbortSignal),
    });
  });

  it("returns only the public fields with the average score and rendered tone", async () => {
    const port = createPort(createCompleteDecision());
    const service = new EvaluationProcessService(port);

    await expect(
      service.evaluate({ ideaText: VALID_IDEA, tone: "hard" }),
    ).resolves.toEqual(EXPECTED_NEUTRAL_RESULT);
  });

  it("returns the score of the first failed criterion after evaluating all ten", async () => {
    const port = createPort(createRejectedDecision());
    const service = new EvaluationProcessService(port);

    await expect(
      service.evaluate({ ideaText: REJECTED_IDEA, tone: "soft" }),
    ).resolves.toEqual({
      status: "RECHAZADA",
      score: 1.3,
      headline: "Esta idea necesita un cambio de rumbo.",
      message: `${SOFT_MESSAGE_PREFIX}${REJECTION_MESSAGE}`,
      safeTitle: "Riesgo de privacidad sin mitigaciones",
      failedCriteria: ["La idea deja la puerta abierta a tus datos."],
    });
  });

  it("returns every failed criterion as safe user-facing copy without exposing rubric IDs", async () => {
    const decision = createRejectedDecision();
    decision.evaluated = decision.evaluated.map((criterion) => ({
      id: criterion.id,
      state: "PUNTUADO",
      score: 10,
    }));
    const service = new EvaluationProcessService(createPort(decision));

    await expect(
      service.evaluate({ ideaText: REJECTED_IDEA, tone: "hard" }),
    ).resolves.toMatchObject({
      failedCriteria: [
        "La idea deja la puerta abierta a tus datos.",
        "Hay una parte de la idea que juega con fuego.",
        "El premio puede acabar empujando a hacer daño.",
        "Las piezas de la idea no encajan.",
        "Todo depende de una promesa difícil de comprobar.",
        "Aquí puede saltar una bronca seria entre personas.",
        "No se ve qué gana alguien al volver a usarla.",
        "Las cuentas no salen ni con calculadora.",
        "El plan solo funciona si todo el mundo sigue el guion.",
        "A la idea le falta un giro propio que la saque del montón.",
      ],
    });
  });

  it("includes only scored criteria below the rejection threshold", async () => {
    const decision = createRejectedDecision();
    decision.evaluated = decision.evaluated.map((criterion, index) => {
      if (index === 2) {
        return { id: criterion.id, state: "INDETERMINADO", score: null };
      }
      let score = 50;
      if (index === 0) score = 14;
      if (index === 1) score = 15;
      return {
        id: criterion.id,
        state: "PUNTUADO",
        score,
      };
    });
    const service = new EvaluationProcessService(createPort(decision));

    await expect(
      service.evaluate({ ideaText: REJECTED_IDEA, tone: "hard" }),
    ).resolves.toMatchObject({
      failedCriteria: ["La idea deja la puerta abierta a tus datos."],
    });
  });

  it("does not expose failed criteria for an idea with no blocking result", async () => {
    const service = new EvaluationProcessService(
      createPort(createCompleteDecision()),
    );

    const response = await service.evaluate({
      ideaText: VALID_IDEA,
      tone: "hard",
    });

    expect(response).not.toHaveProperty("failedCriteria");
  });

  it("keeps a high novelty score from compensating for undefined user value", async () => {
    const port = createPort(createUndefinedUserValueDecision());
    const service = new EvaluationProcessService(port);

    await expect(
      service.evaluate({ ideaText: LOW_VALUE_METRIC_IDEA, tone: "hard" }),
    ).resolves.toMatchObject({ status: "RECHAZADA", score: 1 });
  });

  it("returns a confidently identified existing product example", async () => {
    const port = createPort(createExistingProductDecision());
    const service = new EvaluationProcessService(port);

    await expect(
      service.evaluate({ ideaText: GENERIC_TRAINING_LOG_IDEA, tone: "hard" }),
    ).resolves.toMatchObject({
      status: "RECHAZADA",
      existingProductExample: "Strava",
    });
  });

  it("renders the hard-tone message from validated mechanism and consequence fields", async () => {
    const port = createPort(createRejectedDecision());
    const service = new EvaluationProcessService(port);

    await expect(
      service.evaluate({ ideaText: REJECTED_IDEA, tone: "hard" }),
    ).resolves.toEqual({
      status: "RECHAZADA",
      score: 1.3,
      headline: "Esta idea necesita un cambio de rumbo.",
      message: `${HARD_REJECTION_MESSAGE_PREFIX}${REJECTION_MESSAGE}`,
      safeTitle: "Riesgo de privacidad sin mitigaciones",
      failedCriteria: ["La idea deja la puerta abierta a tus datos."],
    });
  });

  it("returns null only for insufficient input and rejects a functional result without a score", async () => {
    const insufficientPort = createPort(createInsufficientDecision());
    const insufficientService = new EvaluationProcessService(insufficientPort);
    await expect(
      insufficientService.evaluate({ ideaText: VALID_IDEA, tone: "soft" }),
    ).resolves.toMatchObject({ status: "IDEA_INSUFICIENTE", score: null });

    const noScoreableDecision = createCompleteDecision();
    noScoreableDecision.evaluated = noScoreableDecision.evaluated.map(
      (criterion) => ({
        id: criterion.id,
        state: "INDETERMINADO",
        score: null,
      }),
    );
    const noScorePort = createPort(noScoreableDecision);
    const noScoreService = new EvaluationProcessService(noScorePort);
    await expect(
      noScoreService.evaluate({ ideaText: VALID_IDEA, tone: "soft" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("rejects invalid input before calling the evaluation port", async () => {
    const port = createPort(createCompleteDecision());
    const service = new EvaluationProcessService(port);

    await expect(
      service.evaluate({ ideaText: "corta", tone: "soft" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(port.evaluate).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied tone outside the allowlist before calling the port", async () => {
    const port = createPort(createCompleteDecision());
    const service = new EvaluationProcessService(port);

    await expect(
      service.evaluate({ ideaText: VALID_IDEA, tone: "sarcastic" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(port.evaluate).not.toHaveBeenCalled();
  });

  it("returns an unavailable response when no production port is configured", async () => {
    const service = new EvaluationProcessService();
    let caught: unknown;

    try {
      await service.evaluate({ ideaText: VALID_IDEA, tone: "soft" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect(getExceptionResponse(caught)).toEqual(UNAVAILABLE_RESPONSE);
    expect(caught).toMatchObject({
      applicationErrorDiagnostic: "evaluator_not_configured",
    });
    expectExceptionNotToRetainIdea(caught);
  });

  it("allows the Nest application to start without a production evaluator", async () => {
    const application = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });

    try {
      const service = application.get(EvaluationProcessService);
      let caught: unknown;
      try {
        await service.evaluate({ ideaText: VALID_IDEA, tone: "soft" });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ServiceUnavailableException);
      expect(getExceptionResponse(caught)).toEqual(UNAVAILABLE_RESPONSE);
    } finally {
      await application.close();
    }
  });

  it("injects the deterministic test fake into the real evaluation service", async () => {
    const application = await NestFactory.createApplicationContext(
      EvaluationTestingModule,
      { logger: false },
    );

    try {
      const service = application.get(EvaluationProcessService);
      const fake = application.get(FakeEvaluationPort);
      const result = await service.evaluate({
        ideaText: VALID_IDEA,
        tone: "soft",
      });

      expect(result).toEqual({
        status: "REQUIERE_REVISION",
        score: 6.77,
        headline: "La idea aún necesita más trabajo.",
        message: `Con cariño, esta idea todavía necesita trabajo: ${NEUTRAL_MESSAGE}`,
      });
      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]).toMatchObject({
        ideaText: VALID_IDEA,
        policyVersion: POLICY_VERSION,
      });
      expect(fake.calls[0].signal).toBeInstanceOf(AbortSignal);
    } finally {
      await application.close();
    }
  });

  it("maps invalid provider output to a generic service error without retry", async () => {
    const loggerError = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const port = createPort({ status: "RECHAZADA", providerSecret: "secret" });
    const service = new EvaluationProcessService(port);
    let caught: unknown;

    try {
      await service.evaluate({ ideaText: VALID_IDEA, tone: "soft" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect(caught).toMatchObject({
      applicationErrorDiagnostic: "criteria_prefix",
    });
    expect(getExceptionResponse(caught)).toEqual(INVALID_RESPONSE);
    expectExceptionNotToRetainIdea(caught);
    expect(port.evaluate).toHaveBeenCalledTimes(1);
    expect(String(caught)).not.toContain("secret");
    expect(String(caught)).not.toContain(VALID_IDEA);
    expect(loggerError).toHaveBeenCalledWith(
      "INVALID_EVALUATION_RESPONSE validation=criteria_prefix",
    );
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(VALID_IDEA);
  });

  it("retries once when a structured decision has inconsistent semantics", async () => {
    const inconsistentDecision = {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((criterion) =>
        criterion.id === "C04"
          ? { id: "C04", state: "PUNTUADO", score: 10 }
          : criterion,
      ),
    };
    const port = createPort(inconsistentDecision);
    vi.mocked(port.evaluate)
      .mockResolvedValueOnce(inconsistentDecision)
      .mockResolvedValueOnce(createCompleteDecision());
    const service = new EvaluationProcessService(port);

    const result = await service.evaluate({
      ideaText: VALID_IDEA,
      tone: "soft",
    });

    expect(result).toEqual({
      status: "SIN_BLOQUEO_EVIDENTE",
      score: 7.13,
      headline: "La idea pasa este primer repaso, con confeti prudente.",
      message: `${SOFT_MESSAGE_PREFIX}${NEUTRAL_MESSAGE}`,
    });
    expect(port.evaluate).toHaveBeenCalledTimes(2);
    expect(port.evaluate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ideaText: VALID_IDEA,
        policyVersion: POLICY_VERSION,
      }),
    );
  });

  it("retries once when decision fields are internally inconsistent", async () => {
    const invalidDecision = {
      ...createCompleteDecision(),
      basis: "unpaired field",
    };
    const port = createPort(invalidDecision);
    vi.mocked(port.evaluate)
      .mockResolvedValueOnce(invalidDecision)
      .mockResolvedValueOnce(createCompleteDecision());
    const service = new EvaluationProcessService(port);

    await expect(
      service.evaluate({ ideaText: VALID_IDEA, tone: "soft" }),
    ).resolves.toMatchObject({ status: "SIN_BLOQUEO_EVIDENTE" });

    expect(port.evaluate).toHaveBeenCalledTimes(2);
  });

  it("keeps a clear assessment at exactly 7 out of 10 outside review", async () => {
    const decisionAtReviewBoundary = {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((criterion) =>
        criterion.state === "PUNTUADO"
          ? { ...criterion, score: 70 }
          : criterion,
      ),
    };
    const service = new EvaluationProcessService(
      createPort(decisionAtReviewBoundary),
    );

    await expect(
      service.evaluate({ ideaText: VALID_IDEA, tone: "hard" }),
    ).resolves.toEqual({
      status: "SIN_BLOQUEO_EVIDENTE",
      score: 7,
      headline: "La idea pasa este primer repaso, con confeti prudente.",
      message: `${HARD_CLEAR_MESSAGE_PREFIX}${NEUTRAL_MESSAGE}`,
    });
  });

  it("retries once when the generated visible message fails its copy contract", async () => {
    const invalidCopyDecision = {
      ...createCompleteDecision(),
      message: "Vale.",
    };
    const port = createPort(invalidCopyDecision);
    vi.mocked(port.evaluate)
      .mockResolvedValueOnce(invalidCopyDecision)
      .mockResolvedValueOnce(createCompleteDecision());
    const service = new EvaluationProcessService(port);

    const result = await service.evaluate({
      ideaText: VALID_IDEA,
      tone: "soft",
    });

    expect(result).toEqual({
      ...EXPECTED_NEUTRAL_RESULT,
      message: `${SOFT_MESSAGE_PREFIX}${NEUTRAL_MESSAGE}`,
    });
    expect(port.evaluate).toHaveBeenCalledTimes(2);
  });

  it("returns the semantic validation error after the single retry fails", async () => {
    const inconsistentDecision = {
      ...createCompleteDecision(),
      evaluated: createCompleteDecision().evaluated.map((criterion) =>
        criterion.id === "C04"
          ? { id: "C04", state: "PUNTUADO", score: 10 }
          : criterion,
      ),
    };
    const loggerError = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const port = createPort(inconsistentDecision);
    const service = new EvaluationProcessService(port);
    let caught: unknown;

    try {
      await service.evaluate({ ideaText: VALID_IDEA, tone: "soft" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      applicationErrorDiagnostic: "semantic_passing_failed_criterion",
    });
    expectExceptionNotToRetainIdea(caught);
    expect(port.evaluate).toHaveBeenCalledTimes(2);
    expect(loggerError).toHaveBeenCalledWith(
      "INVALID_EVALUATION_RESPONSE validation=semantic_passing_failed_criterion",
    );
  });

  it("maps provider errors without exposing their messages", async () => {
    const loggerError = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const port = {
      evaluate: vi
        .fn()
        .mockRejectedValue(new OpenAiEvaluationFailure("OPENAI_HTTP_429")),
    } satisfies EvaluationPort;
    const service = new EvaluationProcessService(port);
    let caught: unknown;

    try {
      await service.evaluate({ ideaText: VALID_IDEA, tone: "soft" });
    } catch (error) {
      caught = error;
    }

    expect(getExceptionResponse(caught)).toEqual(UNAVAILABLE_RESPONSE);
    expect(caught).toMatchObject({
      applicationErrorDiagnostic: "openai_http_429",
    });
    expectExceptionNotToRetainIdea(caught);
    expect(String(caught)).not.toContain(VALID_IDEA);
    expect(String(caught)).not.toContain("secret");
    expect(loggerError).toHaveBeenCalledWith("OPENAI_HTTP_429");
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(VALID_IDEA);
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain("secret");
    expect(port.evaluate).toHaveBeenCalledTimes(1);
  });

  it("records an unexpected failure category without exposing provider details", async () => {
    const loggerError = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const port = {
      evaluate: vi.fn().mockRejectedValue(new Error(`${VALID_IDEA} secret`)),
    } satisfies EvaluationPort;
    const service = new EvaluationProcessService(port);

    let caught: unknown;
    try {
      await service.evaluate({ ideaText: VALID_IDEA, tone: "soft" });
    } catch (error) {
      caught = error;
    }

    expect(getExceptionResponse(caught)).toEqual(UNAVAILABLE_RESPONSE);
    expect(caught).toMatchObject({
      applicationErrorDiagnostic: "unexpected_evaluation_failure",
    });
    expectExceptionNotToRetainIdea(caught);
    expect(String(caught)).not.toContain(VALID_IDEA);
    expect(String(caught)).not.toContain("secret");
    expect(loggerError).toHaveBeenCalledWith("EVALUATOR_UNAVAILABLE");
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(VALID_IDEA);
  });

  it("aborts and returns a timeout response without retrying", async () => {
    vi.useFakeTimers();
    const loggerWarn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    let requestSignal: AbortSignal | undefined;
    const port: EvaluationPort = {
      evaluate: vi.fn(({ signal }) => {
        requestSignal = signal;
        return new Promise(() => undefined);
      }),
    };
    const service = new EvaluationProcessService(port);
    const pendingEvaluation = service.evaluate({
      ideaText: VALID_IDEA,
      tone: "soft",
    });
    const outcome = pendingEvaluation.then(
      () => null,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(120_000);
    const caught = await outcome;

    expect(caught).toBeInstanceOf(GatewayTimeoutException);
    expect(getExceptionResponse(caught)).toEqual(TIMEOUT_RESPONSE);
    expect(caught).toMatchObject({
      applicationErrorDiagnostic: "evaluation_timeout",
    });
    expectExceptionNotToRetainIdea(caught);
    expect(loggerWarn).toHaveBeenCalledWith("EVALUATION_TIMEOUT");
    expect(requestSignal?.aborted).toBe(true);
    expect(port.evaluate).toHaveBeenCalledTimes(1);
  });

  it("uses the timeout configured by the server environment", async () => {
    vi.stubEnv("EVALUATION_TIMEOUT_MS", "25");
    vi.useFakeTimers();
    const port: EvaluationPort = {
      evaluate: vi.fn(() => new Promise(() => undefined)),
    };
    const service = new EvaluationProcessService(port);
    const pendingEvaluation = service.evaluate({
      ideaText: VALID_IDEA,
      tone: "soft",
    });
    const outcome = pendingEvaluation.then(
      () => null,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(25);

    expect(await outcome).toBeInstanceOf(GatewayTimeoutException);
    expect(port.evaluate).toHaveBeenCalledTimes(1);
  });
});
