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
import { EvaluationTestingModule } from "./evaluation-testing.module";
import { FakeEvaluationPort } from "./fake-evaluation.port";
import { EvaluationProcessService } from "./evaluation-process.service";

const VALID_IDEA = "Una app para coordinar voluntarios en el barrio";
const REJECTED_IDEA =
  "Accedemos sin autorización a datos personales para ofrecer una app de coordinación.";
const POLICY_VERSION = "grumphya-concept-v7";
const NEUTRAL_MESSAGE =
  "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.";
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
  headline: "Sigue en pie. No es para celebrarlo.",
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

function createCompleteDecision(): ModelDecision {
  return {
    status: "SIN_BLOQUEO_EVIDENTE",
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
    message: NEUTRAL_MESSAGE,
    hardSetup: null,
    hardConsequence: null,
  };
}

function createRejectedDecision(): ModelDecision {
  return {
    status: "RECHAZADA",
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
    message: REJECTION_MESSAGE,
    hardSetup: HARD_SETUP,
    hardConsequence: HARD_CONSEQUENCE,
  };
}

function createInsufficientDecision(): ModelDecision {
  return {
    status: "IDEA_INSUFICIENTE",
    evaluated: [],
    stop_at: null,
    reason_code: null,
    basis: null,
    safeTitle: null,
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
      headline: "¡Un abrazo y confeti para esta pega importante!",
      message: `${SOFT_MESSAGE_PREFIX}${REJECTION_MESSAGE}`,
      safeTitle: "Riesgo de privacidad sin mitigaciones",
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
      headline: "La propuesta se ha estampado contra lo esencial.",
      message: `${HARD_REJECTION_MESSAGE_PREFIX}${REJECTION_MESSAGE}`,
      safeTitle: "Riesgo de privacidad sin mitigaciones",
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
        status: "SIN_BLOQUEO_EVIDENTE",
        score: 6.77,
        headline: "¡Qué ilusión! Ha superado el primer repaso.",
        message: `${SOFT_MESSAGE_PREFIX}${NEUTRAL_MESSAGE}`,
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
    expect(port.evaluate).toHaveBeenCalledTimes(1);
    expect(String(caught)).not.toContain("secret");
    expect(String(caught)).not.toContain(VALID_IDEA);
    expect(loggerError).toHaveBeenCalledWith(
      "INVALID_EVALUATION_RESPONSE validation=criteria_prefix",
    );
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(VALID_IDEA);
  });

  it("maps provider errors without exposing their messages", async () => {
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
    expect(String(caught)).not.toContain(VALID_IDEA);
    expect(String(caught)).not.toContain("secret");
    expect(loggerError).toHaveBeenCalledWith("EVALUATOR_UNAVAILABLE");
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(VALID_IDEA);
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain("secret");
    expect(port.evaluate).toHaveBeenCalledTimes(1);
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
