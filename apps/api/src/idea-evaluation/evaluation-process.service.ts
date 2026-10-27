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
  type ModelDecisionValidationCode,
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
  existingProductExample?: string;
  failedCriteria?: string[];
};

const POLICY_VERSION = "grumphya-concept-v9";
const DEFAULT_EVALUATION_TIMEOUT_MS = 120_000;
const MAX_EVALUATION_TIMEOUT_MS = 120_000;
const MAX_SEMANTIC_RETRIES = 1;
const EVALUATION_TIMEOUT_ENV = "EVALUATION_TIMEOUT_MS";
const CONCEPTUAL_SCORE_TO_VISIBLE_DIVISOR = 10;
const VISIBLE_SCORE_DECIMAL_SCALE = 100;
const REJECTION_SCORE_THRESHOLD = 15;
const FAILED_CRITERION_COPY = {
  C01: "La idea deja la puerta abierta a tus datos.",
  C02: "Hay una parte de la idea que juega con fuego.",
  C03: "El premio puede acabar empujando a hacer daño.",
  C04: "Las piezas de la idea no encajan.",
  C05: "Todo depende de una promesa difícil de comprobar.",
  C06: "Aquí puede saltar una bronca seria entre personas.",
  C07: "No se ve qué gana alguien al volver a usarla.",
  C08: "Las cuentas no salen ni con calculadora.",
  C09: "El plan solo funciona si todo el mundo sigue el guion.",
  C10: "A la idea le falta un giro propio que la saque del montón.",
} as const;
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

class InvalidEvaluationResponseException extends ServiceUnavailableException {
  readonly applicationErrorDiagnostic: string;
  readonly applicationErrorContext: {
    useCase: "idea_evaluation";
    inputText: string;
  };

  constructor(validationCode: ModelDecisionValidationCode, inputText: string) {
    super(INVALID_EVALUATION_RESPONSE);
    this.applicationErrorDiagnostic = validationCode;
    this.applicationErrorContext = { useCase: "idea_evaluation", inputText };
  }
}

class EvaluationFailureException extends ServiceUnavailableException {
  readonly applicationErrorDiagnostic: string;
  readonly applicationErrorContext: {
    useCase: "idea_evaluation";
    inputText: string;
  };

  constructor(diagnosticCode: string, inputText: string) {
    super(EVALUATOR_UNAVAILABLE_RESPONSE);
    this.applicationErrorDiagnostic = diagnosticCode;
    this.applicationErrorContext = { useCase: "idea_evaluation", inputText };
  }
}

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
    headline: renderHeadline(decision.status, tone, decision.headline),
    message: renderMessage(decision, tone),
  };
  if (decision.status === "RECHAZADA" && decision.safeTitle) {
    response.safeTitle = decision.safeTitle;
  }
  if (decision.existingProductExample !== null) {
    response.existingProductExample = decision.existingProductExample;
  }
  if (decision.status === "RECHAZADA") {
    response.failedCriteria = decision.evaluated
      .filter(
        (criterion) =>
          criterion.state === "PUNTUADO" &&
          criterion.score < REJECTION_SCORE_THRESHOLD,
      )
      .map((criterion) => FAILED_CRITERION_COPY[criterion.id]);
  }
  return response;
}

async function evaluateWithTimeout(
  port: EvaluationPort,
  ideaText: string,
  tone: "soft" | "hard",
  userId?: string,
  timeoutMs = getEvaluationTimeoutMs(),
): Promise<unknown> {
  const abortController = new AbortController();
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
      ...(userId ? { userId } : {}),
    }),
  );

  try {
    return await Promise.race([evaluationPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function evaluateAndValidate(
  port: EvaluationPort,
  ideaText: string,
  tone: "soft" | "hard",
  userId?: string,
): Promise<ModelDecision> {
  const deadline = Date.now() + getEvaluationTimeoutMs();
  let attempt = 0;

  while (attempt <= MAX_SEMANTIC_RETRIES) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new EvaluationTimeoutError();

    const rawDecision = await evaluateWithTimeout(
      port,
      ideaText,
      tone,
      userId,
      remainingMs,
    );
    try {
      return validateModelDecision(rawDecision, ideaText);
    } catch (error) {
      if (
        !(error instanceof InvalidModelDecisionError) ||
        !error.validationCode.startsWith("semantic_") ||
        attempt === MAX_SEMANTIC_RETRIES
      ) {
        throw error;
      }
      attempt += 1;
    }
  }

  throw new InvalidModelDecisionError("semantic_rejected_criteria_incomplete");
}

@Injectable()
export class EvaluationProcessService {
  private readonly logger = new Logger(EvaluationProcessService.name);

  constructor(
    @Optional()
    @Inject(EVALUATION_PORT)
    private readonly evaluationPort?: EvaluationPort,
  ) {}

  async evaluate(
    input: unknown,
    userId?: string,
  ): Promise<EvaluationProcessResponse> {
    let request;
    try {
      request = normalizeAndValidateRequest(input);
    } catch (error) {
      if (!(error instanceof InvalidEvaluationInputError)) throw error;
      throw new BadRequestException(INVALID_IDEA_RESPONSE);
    }

    if (!this.evaluationPort) {
      throw new EvaluationFailureException(
        "evaluator_not_configured",
        request.ideaText,
      );
    }

    try {
      const decision = await evaluateAndValidate(
        this.evaluationPort,
        request.ideaText,
        request.tone,
        userId,
      );
      return toPublicResponse(decision, request.tone);
    } catch (error) {
      if (error instanceof EvaluationTimeoutError) {
        this.logger.warn(EVALUATION_TIMEOUT_RESPONSE.code);
        const timeout = new GatewayTimeoutException(
          EVALUATION_TIMEOUT_RESPONSE,
        );
        Object.assign(timeout, {
          applicationErrorDiagnostic: "evaluation_timeout",
          applicationErrorContext: {
            useCase: "idea_evaluation",
            inputText: request.ideaText,
          },
        });
        throw timeout;
      }
      if (error instanceof InvalidModelDecisionError) {
        this.logger.error(
          `${INVALID_EVALUATION_RESPONSE.code} validation=${error.validationCode}`,
        );
        throw new InvalidEvaluationResponseException(
          error.validationCode,
          request.ideaText,
        );
      }
      if (error instanceof OpenAiEvaluationFailure) {
        this.logger.error(error.code);
        throw new EvaluationFailureException(
          error.code.toLowerCase(),
          request.ideaText,
        );
      }
      this.logger.error(EVALUATOR_UNAVAILABLE_RESPONSE.code);
      throw new EvaluationFailureException(
        "unexpected_evaluation_failure",
        request.ideaText,
      );
    }
  }
}
