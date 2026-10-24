import {
  authenticatedFetch,
  getAccessToken,
} from "../../infrastructure/auth/session";

export type EvaluationStatus =
  "RECHAZADA" | "SIN_BLOQUEO_EVIDENTE" | "IDEA_INSUFICIENTE";

export type EvaluationProcessResult = {
  status: EvaluationStatus;
  score: number | null;
  headline: string;
  message: string;
  safeTitle?: string;
  existingProductExample?: string;
};

export type SimilarIdeaMatchResult = {
  status: "similar_idea_match";
  safeTitle: string;
  submissionCount: number;
};

export type EvaluationSubmissionResult =
  EvaluationProcessResult | SimilarIdeaMatchResult;

const EVALUATION_ENDPOINT = "/api/evaluation-process";
const EVALUATION_UNAVAILABLE_MESSAGE =
  "No se pudo obtener el scoring. La idea sigue en el formulario; inténtalo otra vez.";
const EVALUATION_TIMEOUT_MESSAGE =
  "La evaluación está tardando más de lo previsto. La idea sigue en el formulario; inténtalo de nuevo.";
const EVALUATION_TIMEOUT_CODE = "EVALUATION_TIMEOUT";
const INVALID_EVALUATION_RESPONSE_CODE = "INVALID_EVALUATION_RESPONSE";
const INVALID_EVALUATION_RETRY_MESSAGE =
  "No se ha podido validar esta evaluación. Puedes volver a intentarlo.";
const EVALUATION_OUTCOME_UNKNOWN_CODE = "EVALUATION_OUTCOME_UNKNOWN";
const EVALUATION_OUTCOME_UNKNOWN_MESSAGE =
  "No hemos podido confirmar si la evaluación terminó. Espera a comprobar el resultado antes de volver a gastar un intento.";
const ANONYMOUS_QUOTA_EXHAUSTED_CODE = "ANONYMOUS_QUOTA_EXHAUSTED";
const PLAN_QUOTA_EXHAUSTED_CODE = "PLAN_QUOTA_EXHAUSTED";
const ACTIVE_PLAN_REQUIRED_CODE = "ACTIVE_PLAN_REQUIRED";
const QUOTA_EXHAUSTED_MESSAGES = {
  ideas:
    "Has agotado tus tres evaluaciones gratuitas. Consulta los planes para continuar.",
  roasts:
    "Has agotado tus tres envíos gratuitos. Consulta los planes para continuar.",
} as const;
const PLAN_QUOTA_EXHAUSTED_MESSAGES = {
  ideas: "Has agotado las 11 evaluaciones disponibles hoy en Iluminado.",
  roasts: "Has agotado los 11 envíos disponibles hoy en Faltón.",
} as const;
const MAX_PUBLIC_SCORE = 10;
const MAX_PUBLIC_HEADLINE_LENGTH = 120;
const MAX_PUBLIC_MESSAGE_LENGTH = 360;
const MAX_PUBLIC_REJECTION_MESSAGE_LENGTH = 1_000;
const MAX_PUBLIC_SAFE_TITLE_LENGTH = 160;
const MIN_PUBLIC_SAFE_TITLE_LENGTH = 8;
const MIN_PUBLIC_PRODUCT_EXAMPLE_LENGTH = 2;
const MAX_PUBLIC_PRODUCT_EXAMPLE_LENGTH = 80;
const SAFE_PUBLIC_PRODUCT_EXAMPLE_PATTERN =
  /^[\p{L}\p{N}][\p{L}\p{N} .&'’()+_-]*$/u;
const PUBLIC_EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
const PUBLIC_URL_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;
const PUBLIC_PHONE_PATTERN = /(?:\+?\d[\d ()-]{7,}\d)/u;
const PUBLIC_CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;

export function getPublicExistingProductExample(
  value: unknown,
  status: EvaluationStatus,
): string | undefined {
  if (
    status !== "RECHAZADA" ||
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < MIN_PUBLIC_PRODUCT_EXAMPLE_LENGTH ||
    value.length > MAX_PUBLIC_PRODUCT_EXAMPLE_LENGTH ||
    value.toLowerCase() === "null" ||
    value.toLowerCase() === "undefined" ||
    !SAFE_PUBLIC_PRODUCT_EXAMPLE_PATTERN.test(value) ||
    PUBLIC_EMAIL_PATTERN.test(value) ||
    PUBLIC_URL_PATTERN.test(value) ||
    PUBLIC_PHONE_PATTERN.test(value) ||
    PUBLIC_CONTROL_PATTERN.test(value)
  ) {
    return undefined;
  }
  return value;
}

export class EvaluationProcessError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvaluationProcessError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEvaluationStatus(value: unknown): value is EvaluationStatus {
  return (
    value === "RECHAZADA" ||
    value === "SIN_BLOQUEO_EVIDENTE" ||
    value === "IDEA_INSUFICIENTE"
  );
}

function isValidPublicScore(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= MAX_PUBLIC_SCORE)
  );
}

function parseEvaluationResponse(
  input: unknown,
): EvaluationProcessResult | null {
  if (!isRecord(input)) return null;
  const { status, score, headline, message } = input;
  if (
    !isEvaluationStatus(status) ||
    !isValidPublicScore(score) ||
    typeof headline !== "string" ||
    headline.trim().length === 0 ||
    headline.length > MAX_PUBLIC_HEADLINE_LENGTH ||
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length >
      (status === "RECHAZADA"
        ? MAX_PUBLIC_REJECTION_MESSAGE_LENGTH
        : MAX_PUBLIC_MESSAGE_LENGTH) ||
    (status === "IDEA_INSUFICIENTE" && score !== null) ||
    (status !== "IDEA_INSUFICIENTE" && score === null)
  ) {
    return null;
  }
  const existingProductExample = getPublicExistingProductExample(
    input.existingProductExample,
    status,
  );

  let safeTitle: string | undefined;
  if (status === "RECHAZADA") {
    if (
      typeof input.safeTitle !== "string" ||
      input.safeTitle.trim().length < MIN_PUBLIC_SAFE_TITLE_LENGTH ||
      input.safeTitle.length > MAX_PUBLIC_SAFE_TITLE_LENGTH
    ) {
      return null;
    }
    safeTitle = input.safeTitle.trim();
  }

  return {
    status,
    score,
    headline,
    message,
    ...(safeTitle ? { safeTitle } : {}),
    ...(existingProductExample ? { existingProductExample } : {}),
  };
}

function parseSubmissionResponse(
  input: unknown,
): EvaluationSubmissionResult | null {
  if (!isRecord(input)) return null;
  if (input.status === "similar_idea_match") {
    if (
      typeof input.safeTitle !== "string" ||
      input.safeTitle.trim().length < MIN_PUBLIC_SAFE_TITLE_LENGTH ||
      input.safeTitle.length > MAX_PUBLIC_SAFE_TITLE_LENGTH ||
      !Number.isSafeInteger(input.submissionCount) ||
      (input.submissionCount as number) < 1
    ) {
      return null;
    }
    return {
      status: "similar_idea_match",
      safeTitle: input.safeTitle.trim(),
      submissionCount: input.submissionCount as number,
    };
  }
  if (input.status !== "evaluated") return null;
  return parseEvaluationResponse(input.result);
}

export async function evaluationProcess(
  request: {
    ideaText: string;
    tone: "soft" | "hard";
  },
  idempotencyKey: string,
  continueAnyway = false,
): Promise<EvaluationSubmissionResult> {
  let response: Response;
  try {
    const accessToken = await getAccessToken();
    const init: RequestInit = {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        ...request,
        ...(continueAnyway ? { continueAnyway: true } : {}),
      }),
    };
    response = accessToken
      ? await authenticatedFetch(EVALUATION_ENDPOINT, init)
      : await fetch(EVALUATION_ENDPOINT, init);
  } catch {
    throw new EvaluationProcessError(
      EVALUATION_OUTCOME_UNKNOWN_CODE,
      EVALUATION_OUTCOME_UNKNOWN_MESSAGE,
    );
  }

  if (!response.ok) {
    let errorCode: unknown;
    let errorScope: unknown;
    try {
      const errorPayload: unknown = await response.json();
      if (isRecord(errorPayload)) {
        errorCode = errorPayload.code;
        errorScope = errorPayload.scope;
      }
    } catch {
      errorCode = undefined;
    }
    if (errorCode === EVALUATION_TIMEOUT_CODE) {
      throw new EvaluationProcessError(
        EVALUATION_TIMEOUT_CODE,
        EVALUATION_TIMEOUT_MESSAGE,
      );
    }
    if (errorCode === INVALID_EVALUATION_RESPONSE_CODE) {
      throw new EvaluationProcessError(
        INVALID_EVALUATION_RESPONSE_CODE,
        INVALID_EVALUATION_RETRY_MESSAGE,
      );
    }
    if (errorCode === ANONYMOUS_QUOTA_EXHAUSTED_CODE) {
      throw new EvaluationProcessError(
        ANONYMOUS_QUOTA_EXHAUSTED_CODE,
        errorScope === "roasts"
          ? QUOTA_EXHAUSTED_MESSAGES.roasts
          : QUOTA_EXHAUSTED_MESSAGES.ideas,
      );
    }
    if (errorCode === PLAN_QUOTA_EXHAUSTED_CODE) {
      throw new EvaluationProcessError(
        PLAN_QUOTA_EXHAUSTED_CODE,
        errorScope === "roasts"
          ? PLAN_QUOTA_EXHAUSTED_MESSAGES.roasts
          : PLAN_QUOTA_EXHAUSTED_MESSAGES.ideas,
      );
    }
    if (errorCode === ACTIVE_PLAN_REQUIRED_CODE) {
      throw new EvaluationProcessError(
        ACTIVE_PLAN_REQUIRED_CODE,
        "Necesitas un plan Iluminado activo para evaluar ideas.",
      );
    }
    throw new Error(EVALUATION_UNAVAILABLE_MESSAGE);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new EvaluationProcessError(
      EVALUATION_OUTCOME_UNKNOWN_CODE,
      EVALUATION_OUTCOME_UNKNOWN_MESSAGE,
    );
  }

  const result = parseSubmissionResponse(payload);
  if (!result) {
    throw new EvaluationProcessError(
      EVALUATION_OUTCOME_UNKNOWN_CODE,
      EVALUATION_OUTCOME_UNKNOWN_MESSAGE,
    );
  }
  return result;
}
