import {
  authenticatedFetch,
  getAccessToken,
} from "../../infrastructure/auth/session";
import {
  ACTIVE_PLAN_REQUIRED_CODE,
  ANONYMOUS_QUOTA_EXHAUSTED_CODE,
  EMAIL_VERIFICATION_REQUIRED_CODE,
  EVALUATION_ENDPOINT,
  EVALUATION_OUTCOME_UNKNOWN_CODE,
  EVALUATION_OUTCOME_UNKNOWN_MESSAGE,
  EVALUATION_TIMEOUT_CODE,
  EVALUATION_TIMEOUT_MESSAGE,
  EVALUATION_UNAVAILABLE_MESSAGE,
  INVALID_EVALUATION_RESPONSE_CODE,
  INVALID_EVALUATION_RETRY_MESSAGE,
  PLAN_QUOTA_EXHAUSTED_CODE,
  PLAN_QUOTA_EXHAUSTED_MESSAGES,
  QUOTA_EXHAUSTED_MESSAGES,
} from "./evaluation.constants";
import {
  EvaluationProcessError,
  isRecord,
  parseSubmissionResponse,
} from "./evaluation.validation";
import type { EvaluationSubmissionResult } from "./evaluation.models";

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
    if (errorCode === EMAIL_VERIFICATION_REQUIRED_CODE) {
      throw new EvaluationProcessError(
        EMAIL_VERIFICATION_REQUIRED_CODE,
        "Confirma tu correo para continuar.",
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
