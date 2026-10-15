export type EvaluationStatus =
  "RECHAZADA" | "SIN_BLOQUEO_EVIDENTE" | "IDEA_INSUFICIENTE";

export type EvaluationProcessResult = {
  status: EvaluationStatus;
  score: number | null;
  headline: string;
  message: string;
  safeTitle?: string;
};

export type SimilarIdeaMatchResult = {
  status: "similar_idea_match";
  safeTitle: string;
  submissionCount: number;
};

export type EvaluationSubmissionResult =
  EvaluationProcessResult | SimilarIdeaMatchResult;

const EVALUATION_ENDPOINT = "/api/evaluation-process";
const INVALID_RESULT_MESSAGE =
  "El servicio devolvió un resultado que no se puede verificar.";
const EVALUATION_UNAVAILABLE_MESSAGE =
  "No se pudo obtener el scoring. La idea sigue en el formulario; inténtalo otra vez.";
const EVALUATION_TIMEOUT_MESSAGE =
  "La evaluación está tardando más de lo previsto. La idea sigue en el formulario; inténtalo de nuevo.";
const EVALUATION_TIMEOUT_CODE = "EVALUATION_TIMEOUT";
const ANONYMOUS_QUOTA_EXHAUSTED_CODE = "ANONYMOUS_QUOTA_EXHAUSTED";
const QUOTA_EXHAUSTED_MESSAGES = {
  ideas:
    "Has agotado tus tres evaluaciones gratuitas. Consulta los planes para continuar.",
  roasts:
    "Has agotado tus tres envíos gratuitos. Consulta los planes para continuar.",
} as const;
const MAX_PUBLIC_SCORE = 10;
const MAX_PUBLIC_HEADLINE_LENGTH = 120;
const MAX_PUBLIC_MESSAGE_LENGTH = 280;
const MAX_PUBLIC_SAFE_TITLE_LENGTH = 160;
const MIN_PUBLIC_SAFE_TITLE_LENGTH = 8;

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
    message.length > MAX_PUBLIC_MESSAGE_LENGTH ||
    (status === "IDEA_INSUFICIENTE" && score !== null) ||
    (status !== "IDEA_INSUFICIENTE" && score === null)
  ) {
    return null;
  }

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
    response = await fetch(EVALUATION_ENDPOINT, {
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
    });
  } catch {
    throw new Error(EVALUATION_UNAVAILABLE_MESSAGE);
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
    if (errorCode === ANONYMOUS_QUOTA_EXHAUSTED_CODE) {
      throw new EvaluationProcessError(
        ANONYMOUS_QUOTA_EXHAUSTED_CODE,
        errorScope === "roasts"
          ? QUOTA_EXHAUSTED_MESSAGES.roasts
          : QUOTA_EXHAUSTED_MESSAGES.ideas,
      );
    }
    throw new Error(EVALUATION_UNAVAILABLE_MESSAGE);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(INVALID_RESULT_MESSAGE);
  }

  const result = parseSubmissionResponse(payload);
  if (!result) throw new Error(INVALID_RESULT_MESSAGE);
  return result;
}
