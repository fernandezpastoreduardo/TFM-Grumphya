import {
  BadRequestException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  InvalidModelDecisionError,
  renderHeadline,
  renderMessage,
  validateModelDecision,
  type ModelDecision,
} from "./evaluation-decision";
import { EVALUATION_PORT, type EvaluationPort } from "./evaluation-port";
import { OpenAiEvaluationFailure } from "./openai-evaluation.port";
import {
  InvalidEvaluationInputError,
  normalizeAndValidateRequest,
} from "./evaluation-process";

export type EvaluationProcessResponse = {
  status: ModelDecision["status"];
  score: number | null;
  headline: string;
  message: string;
  safeTitle?: string;
};

const POLICY_VERSION = "grumphya-concept-v7";
const DEFAULT_EVALUATION_TIMEOUT_MS = 60_000;
const MAX_EVALUATION_TIMEOUT_MS = 120_000;
const EVALUATION_TIMEOUT_ENV = "EVALUATION_TIMEOUT_MS";
const CONCEPTUAL_SCORE_TO_VISIBLE_DIVISOR = 10;
const VISIBLE_SCORE_DECIMAL_SCALE = 100;
const REJECTION_SCORE_THRESHOLD = 15;
const INVALID_IDEA_RESPONSE = {
  code: "INVALID_IDEA",
  message: "La idea debe tener entre 10 y 2.000 caracteres y un tono válido.",
};
const EVALUATOR_UNAVAILABLE_RESPONSE = {
  code: "EVALUATOR_UNAVAILABLE",
  message: "El servicio de evaluación no está disponible ahora.",
};
const INVALID_EVALUATION_RESPONSE = {
  code: "INVALID_EVALUATION_RESPONSE",
  message: "No se ha podido evaluar la idea ahora.",
};
const EVALUATION_TIMEOUT_RESPONSE = {
  code: "EVALUATION_TIMEOUT",
  message: "La evaluación ha tardado demasiado. Inténtalo más tarde.",
};

class EvaluationTimeoutError extends Error {
  constructor() {
    super("Evaluation timed out.");
    this.name = "EvaluationTimeoutError";
  }
}

function getEvaluationTimeoutMs(): number {
  const configuredTimeout = Number(process.env[EVALUATION_TIMEOUT_ENV]);
  if (
    Number.isSafeInteger(configuredTimeout) &&
    configuredTimeout > 0 &&
    configuredTimeout <= MAX_EVALUATION_TIMEOUT_MS
  ) {
    return configuredTimeout;
  }
  return DEFAULT_EVALUATION_TIMEOUT_MS;
}

function getAverageConceptualScore(decision: ModelDecision): number | null {
  const scoredCriteria = decision.evaluated.filter(
    (criterion) => criterion.state === "PUNTUADO",
  );
  if (scoredCriteria.length === 0) return null;

  const totalScore = scoredCriteria.reduce(
    (total, criterion) => total + criterion.score,
    0,
  );
  return (
    Math.round(
      (totalScore * VISIBLE_SCORE_DECIMAL_SCALE) /
        (scoredCriteria.length * CONCEPTUAL_SCORE_TO_VISIBLE_DIVISOR),
    ) / VISIBLE_SCORE_DECIMAL_SCALE
  );
}

function getPublicScore(decision: ModelDecision): number | null {
  if (decision.status === "IDEA_INSUFICIENTE") return null;
  if (decision.status === "SIN_BLOQUEO_EVIDENTE") {
    return getAverageConceptualScore(decision);
  }

  const rejectingCriterion = decision.evaluated.find(
    (criterion) =>
      criterion.state === "PUNTUADO" &&
      criterion.score < REJECTION_SCORE_THRESHOLD,
  );
  if (rejectingCriterion?.state !== "PUNTUADO") {
    throw new InvalidModelDecisionError();
  }
  return rejectingCriterion.score / CONCEPTUAL_SCORE_TO_VISIBLE_DIVISOR;
}

function toPublicResponse(
  decision: ModelDecision,
  tone: "soft" | "hard",
): EvaluationProcessResponse {
  const response: EvaluationProcessResponse = {
    status: decision.status,
    score: getPublicScore(decision),
    headline: renderHeadline(decision.status, tone),
    message: renderMessage(decision, tone),
  };
  if (decision.status === "RECHAZADA" && decision.safeTitle) {
    response.safeTitle = decision.safeTitle;
  }
  return response;
}

async function evaluateWithTimeout(
  port: EvaluationPort,
  ideaText: string,
  tone: "soft" | "hard",
): Promise<unknown> {
  const abortController = new AbortController();
  const timeoutMs = getEvaluationTimeoutMs();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new EvaluationTimeoutError());
      abortController.abort();
    }, timeoutMs);
  });
  const evaluationPromise = Promise.resolve().then(() =>
    port.evaluate({
      ideaText,
      tone,
      policyVersion: POLICY_VERSION,
      signal: abortController.signal,
    }),
  );

  try {
    return await Promise.race([evaluationPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

@Injectable()
export class EvaluationProcessService {
  private readonly logger = new Logger(EvaluationProcessService.name);

  constructor(
    @Optional()
    @Inject(EVALUATION_PORT)
    private readonly evaluationPort?: EvaluationPort,
  ) {}

  async evaluate(input: unknown): Promise<EvaluationProcessResponse> {
    let request;
    try {
      request = normalizeAndValidateRequest(input);
    } catch (error) {
      if (!(error instanceof InvalidEvaluationInputError)) throw error;
      throw new BadRequestException(INVALID_IDEA_RESPONSE);
    }

    if (!this.evaluationPort) {
      throw new ServiceUnavailableException(EVALUATOR_UNAVAILABLE_RESPONSE);
    }

    try {
      const rawDecision = await evaluateWithTimeout(
        this.evaluationPort,
        request.ideaText,
        request.tone,
      );
      const decision = validateModelDecision(rawDecision, request.ideaText);
      return toPublicResponse(decision, request.tone);
    } catch (error) {
      if (error instanceof EvaluationTimeoutError) {
        this.logger.warn(EVALUATION_TIMEOUT_RESPONSE.code);
        throw new GatewayTimeoutException(EVALUATION_TIMEOUT_RESPONSE);
      }
      if (error instanceof InvalidModelDecisionError) {
        this.logger.error(
          `${INVALID_EVALUATION_RESPONSE.code} validation=${error.validationCode}`,
        );
        throw new ServiceUnavailableException(INVALID_EVALUATION_RESPONSE);
      }
      if (error instanceof OpenAiEvaluationFailure) {
        this.logger.error(error.code);
        throw new ServiceUnavailableException(EVALUATOR_UNAVAILABLE_RESPONSE);
      }
      this.logger.error(EVALUATOR_UNAVAILABLE_RESPONSE.code);
      throw new ServiceUnavailableException(EVALUATOR_UNAVAILABLE_RESPONSE);
    }
  }
}
