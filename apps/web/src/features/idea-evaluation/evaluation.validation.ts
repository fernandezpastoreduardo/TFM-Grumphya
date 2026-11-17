import { containsEmailAddress } from "../../shared/utils/email-address";
import {
  MAX_PUBLIC_FAILED_CRITERIA,
  MAX_PUBLIC_HEADLINE_LENGTH,
  MAX_PUBLIC_MESSAGE_LENGTH,
  MAX_PUBLIC_REJECTION_MESSAGE_LENGTH,
  MAX_PUBLIC_PRODUCT_EXAMPLE_LENGTH,
  MAX_PUBLIC_SCORE,
  MAX_PUBLIC_SAFE_TITLE_LENGTH,
  MIN_PUBLIC_PRODUCT_EXAMPLE_LENGTH,
  MIN_PUBLIC_SAFE_TITLE_LENGTH,
  PUBLIC_CONTROL_PATTERN,
  PUBLIC_FAILED_CRITERION_COPY_SET,
  PUBLIC_PHONE_PATTERN,
  PUBLIC_URL_PATTERN,
  SAFE_PUBLIC_PRODUCT_EXAMPLE_PATTERN,
  isSpecialIdeaCaseId,
} from "./evaluation.constants";
import type {
  EvaluationProcessResult,
  EvaluationStatus,
  EvaluationSubmissionResult,
  SimilarIdeaMatchResult,
  SpecialIdeaCaseResult,
} from "./evaluation.models";

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
    containsEmailAddress(value) ||
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

export function isRecord(value: unknown): value is Record<string, unknown> {
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

type ValidEvaluationCore = {
  status: EvaluationStatus;
  score: number | null;
  headline: string;
  message: string;
};

function isValidEvaluationText(
  status: EvaluationStatus,
  headline: unknown,
  message: unknown,
): headline is string {
  return (
    typeof headline === "string" &&
    headline.trim().length > 0 &&
    headline.length <= MAX_PUBLIC_HEADLINE_LENGTH &&
    typeof message === "string" &&
    message.trim().length > 0 &&
    message.length <=
      (status === "RECHAZADA"
        ? MAX_PUBLIC_REJECTION_MESSAGE_LENGTH
        : MAX_PUBLIC_MESSAGE_LENGTH)
  );
}

function isValidEvaluationScore(
  status: EvaluationStatus,
  score: unknown,
): score is number | null {
  return (
    isValidPublicScore(score) &&
    (status === "IDEA_INSUFICIENTE" ? score === null : score !== null)
  );
}

function isValidEvaluationCore(
  input: Record<string, unknown>,
): input is Record<string, unknown> & ValidEvaluationCore {
  return (
    isEvaluationStatus(input.status) &&
    isValidEvaluationScore(input.status, input.score) &&
    isValidEvaluationText(input.status, input.headline, input.message)
  );
}

function parseEvaluationResponse(
  input: unknown,
): EvaluationProcessResult | null {
  if (!isRecord(input) || !isValidEvaluationCore(input)) return null;
  const { status, score, headline, message } = input;
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
    if (!isValidPublicSafeTitle(input.safeTitle)) return null;
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

function isValidPublicSafeTitle(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= MIN_PUBLIC_SAFE_TITLE_LENGTH &&
    value.length <= MAX_PUBLIC_SAFE_TITLE_LENGTH
  );
}

function parseSpecialCaseResponse(
  input: Record<string, unknown>,
): SpecialIdeaCaseResult | null {
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

function isValidSimilarHeadline(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length >= 4 &&
    value.length <= MAX_PUBLIC_HEADLINE_LENGTH &&
    !/[\p{Cc}\p{Cf}]/u.test(value) &&
    !/\bC(?:0[1-9]|10)\b/iu.test(value) &&
    !/(?:https?:\/\/|www\.)/iu.test(value) &&
    !containsEmailAddress(value)
  );
}

function parseSimilarIdeaResponse(
  input: Record<string, unknown>,
): SimilarIdeaMatchResult | null {
  if (
    !isValidSimilarHeadline(input.headline) ||
    !isValidPublicSafeTitle(input.safeTitle) ||
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

export function parseSubmissionResponse(
  input: unknown,
): EvaluationSubmissionResult | null {
  if (!isRecord(input)) return null;
  if (input.status === "special_case") return parseSpecialCaseResponse(input);
  if (input.status === "similar_idea_match")
    return parseSimilarIdeaResponse(input);
  if (input.status !== "evaluated") return null;
  return parseEvaluationResponse(input.result);
}
