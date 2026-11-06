import {
  authenticatedFetch,
  getAccessToken,
} from "../../infrastructure/auth/session";

export type EvaluationStatus =
  | "RECHAZADA"
  | "REQUIERE_REVISION"
  | "SIN_BLOQUEO_EVIDENTE"
  | "IDEA_INSUFICIENTE";

export type EvaluationProcessResult = {
  status: EvaluationStatus;
  score: number | null;
  headline: string;
  message: string;
  safeTitle?: string;
  existingProductExample?: string;
  failedCriteria?: string[];
};

export type SimilarIdeaMatchResult = {
  status: "similar_idea_match";
  headline: string;
  safeTitle: string;
  submissionCount: number;
};

export type SpecialIdeaCaseResult = {
  status: "special_case";
  caseId: "grumphya_equivalent" | "insult" | "too_brief" | "generic_ai_clone";
  title: string;
  message: string;
  action?: { label: "Me atrevo"; href: "/descargate" };
};

export type EvaluationSubmissionResult =
  EvaluationProcessResult | SimilarIdeaMatchResult | SpecialIdeaCaseResult;

const EVALUATION_ENDPOINT = "/api/evaluation-process";
const EVALUATION_UNAVAILABLE_MESSAGE =
  "No se pudo obtener el scoring. La idea sigue en el formulario; inténtalo otra vez.";
const EVALUATION_TIMEOUT_MESSAGE =
  "La evaluación está tardando más de lo previsto. La idea sigue en el formulario; inténtalo de nuevo.";
const EVALUATION_TIMEOUT_CODE = "EVALUATION_TIMEOUT";
const EVALUATION_OUTCOME_UNKNOWN_CODE = "EVALUATION_OUTCOME_UNKNOWN";
const EVALUATION_OUTCOME_UNKNOWN_MESSAGE =
  "No hemos podido confirmar si la evaluación terminó. Espera a comprobar el resultado antes de volver a gastar un intento.";
const INVALID_EVALUATION_RESPONSE_CODE = "INVALID_EVALUATION_RESPONSE";
const INVALID_EVALUATION_RETRY_MESSAGE =
  "No se ha podido validar esta evaluación. Puedes volver a intentarlo.";
const ANONYMOUS_QUOTA_EXHAUSTED_CODE = "ANONYMOUS_QUOTA_EXHAUSTED";
const PLAN_QUOTA_EXHAUSTED_CODE = "PLAN_QUOTA_EXHAUSTED";
const ACTIVE_PLAN_REQUIRED_CODE = "ACTIVE_PLAN_REQUIRED";
const EMAIL_VERIFICATION_REQUIRED_CODE = "EMAIL_VERIFICATION_REQUIRED";
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
const MAX_PUBLIC_MESSAGE_LENGTH = 900;
const MAX_PUBLIC_REJECTION_MESSAGE_LENGTH = 1_000;
const MAX_PUBLIC_SAFE_TITLE_LENGTH = 160;
const MIN_PUBLIC_SAFE_TITLE_LENGTH = 8;
const MIN_PUBLIC_PRODUCT_EXAMPLE_LENGTH = 2;
const MAX_PUBLIC_PRODUCT_EXAMPLE_LENGTH = 80;
const MAX_PUBLIC_FAILED_CRITERIA = 10;
const SPECIAL_CASE_IDS = new Set([
  "grumphya_equivalent",
  "insult",
  "too_brief",
  "generic_ai_clone",
]);

function isSpecialIdeaCaseId(
  value: unknown,
): value is SpecialIdeaCaseResult["caseId"] {
  return typeof value === "string" && SPECIAL_CASE_IDS.has(value);
}
const PUBLIC_FAILED_CRITERION_COPY = [
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
] as const;
const PUBLIC_FAILED_CRITERION_COPY_SET = new Set<string>(
  PUBLIC_FAILED_CRITERION_COPY,
);
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
    value === "REQUIERE_REVISION" ||
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

function parseFailedCriteria(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_PUBLIC_FAILED_CRITERIA
  ) {
    return null;
  }
  const criteria: string[] = [];
  for (const criterion of value) {
    if (
      typeof criterion !== "string" ||
      criterion.trim() !== criterion ||
      !PUBLIC_FAILED_CRITERION_COPY_SET.has(criterion) ||
      PUBLIC_CONTROL_PATTERN.test(criterion) ||
      criteria.includes(criterion)
    ) {
      return null;
    }
    criteria.push(criterion);
  }
  return criteria;
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
  const hasFailedCriteria = Object.hasOwn(input, "failedCriteria");
  const failedCriteria = hasFailedCriteria
    ? parseFailedCriteria(input.failedCriteria)
    : undefined;
  if (hasFailedCriteria && (status !== "RECHAZADA" || !failedCriteria)) {
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
    ...(existingProductExample ? { existingProductExample } : {}),
    ...(failedCriteria ? { failedCriteria } : {}),
  };
}

function parseSubmissionResponse(
  input: unknown,
): EvaluationSubmissionResult | null {
  if (!isRecord(input)) return null;
  if (input.status === "special_case") {
    if (
      !isSpecialIdeaCaseId(input.caseId) ||
      typeof input.title !== "string" ||
      input.title.trim().length === 0 ||
      input.title.length > 120 ||
      typeof input.message !== "string" ||
      input.message.trim().length === 0 ||
      input.message.length > MAX_PUBLIC_REJECTION_MESSAGE_LENGTH
    ) {
      return null;
    }
    if (input.action !== undefined) {
      if (
        input.caseId !== "insult" ||
        !isRecord(input.action) ||
        input.action.label !== "Me atrevo" ||
        input.action.href !== "/descargate"
      ) {
        return null;
      }
      return {
        status: "special_case",
        caseId: input.caseId,
        title: input.title.trim(),
        message: input.message.trim(),
        action: { label: "Me atrevo", href: "/descargate" },
      };
    }
    if (input.caseId === "insult") return null;
    return {
      status: "special_case",
      caseId: input.caseId,
      title: input.title.trim(),
      message: input.message.trim(),
    };
  }
  if (input.status === "similar_idea_match") {
    if (
      typeof input.headline !== "string" ||
      input.headline.trim() !== input.headline ||
      input.headline.length < 4 ||
      input.headline.length > MAX_PUBLIC_HEADLINE_LENGTH ||
      /[\p{Cc}\p{Cf}]/u.test(input.headline) ||
      /\bC(?:0[1-9]|10)\b/iu.test(input.headline) ||
      /(?:https?:\/\/|www\.)|\b[^\s@]+@[^\s@]+\.[^\s@]+\b/iu.test(
        input.headline,
      ) ||
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
      headline: input.headline,
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
