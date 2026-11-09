import { createHash, createHmac } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  DetailedSimilarIdeaSearchResult,
  SearchSimilarIdea,
  SimilarIdeaSearchResult,
} from "../search-similar-idea/search-similar-idea";
import type { WorstIdeasRepository } from "../worst-ideas/worst-ideas.models";
import type { AnonymousUsageService } from "../manage-user-unknow/anonymous-usage.service";
import { REPEATED_IDEA_HEADLINE_FALLBACK } from "../infrastructure/copy/public-headlines";
import { isSafeGeneratedHeadline } from "../infrastructure/validation/public-headline";
import type { RegistrationRepository } from "../register-with-plan/registration.repository";
import type { PlanUsageService } from "../register-with-plan/plan-usage.service";
import type { PlanUsageReservation } from "../register-with-plan/plan-usage.models";
import type { ReservationResult } from "../manage-user-unknow/anonymous-usage.models";
import {
  InvalidEvaluationInputError,
  MAX_IDEA_LENGTH,
  normalizeAndValidateRequest,
} from "./evaluation-process";
import {
  detectSpecialIdeaCase,
  parseSpecialIdeaCaseResponse,
  type SpecialIdeaCase,
} from "./special-idea-cases";
import {
  EvaluationProcessService,
  type EvaluationProcessResponse,
} from "./evaluation-process.service";

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INVALID_REQUEST_RESPONSE = {
  code: "INVALID_IDEA_SUBMISSION",
  message: "No se ha podido procesar el envío de la idea.",
};
const INVALID_CONTINUATION_RESPONSE = {
  code: "IDEA_CONTINUATION_UNAVAILABLE",
  message: "No se puede continuar esta evaluación. Envía la idea de nuevo.",
};
const SIMILARITY_UNAVAILABLE_RESPONSE = {
  code: "SIMILARITY_UNAVAILABLE",
  message: "No se ha podido comprobar la similitud ahora.",
};
const INVALID_REJECTION_TITLE_RESPONSE = {
  code: "INVALID_REJECTION_TITLE",
  message: "No se ha podido guardar el resultado de la evaluación.",
};
const APPROVED_IDEA_PERSISTENCE_ERROR = {
  code: "APPROVED_IDEA_UNAVAILABLE",
  message: "No se ha podido guardar la idea en tu perfil ahora.",
};
const APPROVED_IDEA_TITLE_LIMIT = 160;
const APPROVED_IDEA_WHITESPACE_PATTERN = /\s+/gu;
const USER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_CACHED_EVALUATION_HEADLINE_LENGTH = 120;
const MAX_CACHED_EVALUATION_MESSAGE_LENGTH = 1_000;
const MAX_CACHED_EVALUATION_TITLE_LENGTH = 160;
const MIN_CACHED_EVALUATION_TITLE_LENGTH = 8;
const MIN_CACHED_PRODUCT_EXAMPLE_LENGTH = 2;
const MAX_CACHED_PRODUCT_EXAMPLE_LENGTH = 80;
const MAX_CACHED_FAILED_CRITERIA = 10;
const EVALUATION_STATUSES = new Set([
  "RECHAZADA",
  "REQUIERE_REVISION",
  "SIN_BLOQUEO_EVIDENTE",
  "IDEA_INSUFICIENTE",
]);

type EvaluationRequest = ReturnType<typeof normalizeAndValidateRequest>;
type UsageReservation =
  | { source: "account"; userId: string; result: PlanUsageReservation }
  | { source: "anonymous"; result?: ReservationResult };
type SubmissionFlow = {
  request: EvaluationRequest;
  idempotencyHash: string;
  requestHash: string;
  anonymousVisitorToken: unknown;
  authenticatedUserId: string | undefined;
};
type SimilarMatch = Extract<SimilarIdeaSearchResult, { kind: "match" }>;

export type IdeaSubmissionResponse =
  | {
      status: "similar_idea_match";
      headline: string;
      safeTitle: string;
      submissionCount: number;
    }
  | SpecialIdeaCase
  | { status: "evaluated"; result: EvaluationProcessResponse };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(input: unknown): EvaluationRequest & {
  continueAnyway: boolean;
} {
  const allowedKeys = new Set(["ideaText", "tone", "continueAnyway"]);
  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => !allowedKeys.has(key)) ||
    (input.continueAnyway !== undefined &&
      typeof input.continueAnyway !== "boolean")
  ) {
    throw new BadRequestException(INVALID_REQUEST_RESPONSE);
  }

  if (
    typeof input.ideaText !== "string" ||
    (input.tone !== "soft" && input.tone !== "hard")
  ) {
    throw new BadRequestException(INVALID_REQUEST_RESPONSE);
  }
  const ideaText = input.ideaText.trim();
  if (ideaText.length === 0 || ideaText.length > MAX_IDEA_LENGTH)
    throw new BadRequestException(INVALID_REQUEST_RESPONSE);
  return {
    ideaText,
    tone: input.tone,
    continueAnyway: input.continueAnyway === true,
  };
}

function hashIdempotencyKey(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey).digest("hex");
}

function hashSubmissionRequest(
  request: EvaluationRequest,
  idempotencyKey: string,
): string {
  return createHmac("sha256", idempotencyKey)
    .update(JSON.stringify({ ideaText: request.ideaText, tone: request.tone }))
    .digest("hex");
}

@Injectable()
export class IdeaSubmissionService {
  private readonly logger = new Logger(IdeaSubmissionService.name);

  constructor(
    private readonly search: SearchSimilarIdea | undefined,
    private readonly repository: WorstIdeasRepository,
    private readonly evaluation: EvaluationProcessService,
    private readonly anonymousUsage?: AnonymousUsageService,
    private readonly registrationRepository?: Pick<
      RegistrationRepository,
      "saveGoodIdea"
    >,
    private readonly planUsage?: PlanUsageService,
  ) {}

  async submit(
    input: unknown,
    idempotencyKeyInput: unknown,
    anonymousVisitorToken?: unknown,
    authenticatedUserId?: unknown,
  ): Promise<IdeaSubmissionResponse> {
    const request = parseRequest(input);
    const userId = readAuthenticatedUserId(authenticatedUserId);
    if (
      typeof idempotencyKeyInput !== "string" ||
      !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKeyInput)
    ) {
      throw new BadRequestException(INVALID_REQUEST_RESPONSE);
    }
    const canonicalIdempotencyKey = idempotencyKeyInput.toLowerCase();
    const idempotencyHash = hashIdempotencyKey(canonicalIdempotencyKey);
    const requestHash = hashSubmissionRequest(request, canonicalIdempotencyKey);
    let keyBoundToDifferentRequest: boolean;
    try {
      keyBoundToDifferentRequest =
        await this.repository.hasDifferentIdempotentRequest(
          idempotencyHash,
          requestHash,
        );
    } catch {
      this.logger.error("IDEA_IDEMPOTENCY_LOOKUP_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    if (keyBoundToDifferentRequest) {
      throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
    }

    if (request.continueAnyway) {
      return this.continueAfterMatch(
        request,
        idempotencyHash,
        requestHash,
        anonymousVisitorToken,
        userId,
      );
    }

    return this.checkAndSubmit(
      request,
      idempotencyHash,
      requestHash,
      anonymousVisitorToken,
      userId,
    );
  }

  private async continueAfterMatch(
    request: EvaluationRequest,
    idempotencyHash: string,
    requestHash: string,
    anonymousVisitorToken: unknown,
    authenticatedUserId: string | undefined,
  ): Promise<IdeaSubmissionResponse> {
    let previousMatch;
    try {
      previousMatch = await this.repository.getIdempotentMatch(
        idempotencyHash,
        requestHash,
      );
    } catch {
      this.logger.error("IDEA_CONTINUATION_LOOKUP_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    if (!previousMatch) {
      throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
    }

    const reservation = await this.reserveUsage(
      anonymousVisitorToken,
      idempotencyHash,
      requestHash,
      authenticatedUserId,
    );
    if (reservation?.result?.state === "cached")
      return readCachedSubmission(reservation.result.response);

    let continuationClaimed: boolean;
    try {
      continuationClaimed = await this.repository.claimIdempotentContinuation(
        idempotencyHash,
        requestHash,
      );
    } catch {
      await this.releaseUsage(
        anonymousVisitorToken,
        idempotencyHash,
        reservation,
      );
      this.logger.error("IDEA_CONTINUATION_CLAIM_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    if (!continuationClaimed) {
      await this.releaseUsage(
        anonymousVisitorToken,
        idempotencyHash,
        reservation,
      );
      throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
    }

    try {
      const evaluationRequest = this.toEvaluationRequest(request);
      const result = authenticatedUserId
        ? await this.evaluation.evaluate(evaluationRequest, authenticatedUserId)
        : await this.evaluation.evaluate(evaluationRequest);
      await this.persistApprovedIdeaIfNeeded(
        authenticatedUserId,
        idempotencyHash,
        requestHash,
        request.ideaText,
        result,
      );
      const response: IdeaSubmissionResponse = { status: "evaluated", result };
      await this.commitUsage(
        anonymousVisitorToken,
        idempotencyHash,
        requestHash,
        response,
        reservation,
      );
      return response;
    } catch (error) {
      try {
        await this.releaseUsage(
          anonymousVisitorToken,
          idempotencyHash,
          reservation,
        );
      } finally {
        await this.releaseContinuationClaim(idempotencyHash, requestHash);
      }
      throw error;
    }
  }

  private async releaseContinuationClaim(
    idempotencyHash: string,
    requestHash: string,
  ): Promise<void> {
    try {
      await this.repository.releaseIdempotentContinuation(
        idempotencyHash,
        requestHash,
      );
    } catch {
      this.logger.error("IDEA_CONTINUATION_RELEASE_FAILED");
    }
  }

  private async checkAndSubmit(
    request: EvaluationRequest,
    idempotencyHash: string,
    requestHash: string,
    anonymousVisitorToken: unknown,
    authenticatedUserId: string | undefined,
  ): Promise<IdeaSubmissionResponse> {
    const flow: SubmissionFlow = {
      request,
      idempotencyHash,
      requestHash,
      anonymousVisitorToken,
      authenticatedUserId,
    };
    const specialCase = detectSpecialIdeaCase(request.ideaText);
    if (specialCase) return this.submitSpecialCase(flow, specialCase);
    this.validateEvaluationRequest(request);
    const previousMatch = await this.readPreviousMatch(flow);
    if (previousMatch) return previousMatch;

    const reservation = await this.reserveUsage(
      anonymousVisitorToken,
      idempotencyHash,
      requestHash,
      authenticatedUserId,
    );
    if (reservation?.result?.state === "cached")
      return readCachedSubmission(reservation.result.response);
    const detailedSearch = await this.searchWithReservation(flow, reservation);
    if (detailedSearch.result.kind === "match") {
      return this.recordSimilarMatch(flow, reservation, detailedSearch.result);
    }
    return this.evaluateNewIdea(flow, reservation, detailedSearch.embedding);
  }

  private async submitSpecialCase(
    flow: SubmissionFlow,
    specialCase: SpecialIdeaCase,
  ): Promise<IdeaSubmissionResponse> {
    const {
      anonymousVisitorToken: token,
      idempotencyHash: keyHash,
      requestHash,
      authenticatedUserId: userId,
    } = flow;
    const reservation = await this.reserveUsage(
      token,
      keyHash,
      requestHash,
      userId,
    );
    if (reservation?.result?.state === "cached")
      return readCachedSubmission(reservation.result.response);
    try {
      await this.commitUsage(
        token,
        keyHash,
        requestHash,
        specialCase,
        reservation,
      );
      return specialCase;
    } catch {
      await this.releaseUsage(token, keyHash, reservation);
      this.logger.error("IDEA_SPECIAL_CASE_COMMIT_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
  }

  private validateEvaluationRequest(request: EvaluationRequest): void {
    try {
      normalizeAndValidateRequest(request);
    } catch (error) {
      if (!(error instanceof InvalidEvaluationInputError)) throw error;
      throw new BadRequestException(INVALID_REQUEST_RESPONSE);
    }
  }

  private async readPreviousMatch(
    flow: SubmissionFlow,
  ): Promise<IdeaSubmissionResponse | undefined> {
    const { idempotencyHash, requestHash, request } = flow;
    try {
      const previousMatch = await this.repository.getIdempotentMatch(
        idempotencyHash,
        requestHash,
      );
      if (!previousMatch) return undefined;
      return {
        status: "similar_idea_match",
        headline: isSafeGeneratedHeadline(
          previousMatch.headline,
          request.ideaText,
        )
          ? previousMatch.headline
          : REPEATED_IDEA_HEADLINE_FALLBACK[request.tone],
        safeTitle: previousMatch.safeTitle,
        submissionCount: previousMatch.count,
      };
    } catch {
      this.logger.error("IDEA_IDEMPOTENCY_LOOKUP_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
  }

  private async searchWithReservation(
    flow: SubmissionFlow,
    reservation: UsageReservation | undefined,
  ): Promise<DetailedSimilarIdeaSearchResult> {
    const {
      anonymousVisitorToken: token,
      idempotencyHash: keyHash,
      request,
    } = flow;
    if (!this.search) {
      await this.releaseUsage(token, keyHash, reservation);
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    try {
      return await this.search.executeDetailed(
        { ideaText: request.ideaText },
        flow.authenticatedUserId,
        request.tone,
      );
    } catch {
      await this.releaseUsage(token, keyHash, reservation);
      this.logger.error("IDEA_SIMILARITY_CHECK_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
  }

  private async recordSimilarMatch(
    flow: SubmissionFlow,
    reservation: UsageReservation | undefined,
    match: SimilarMatch,
  ): Promise<IdeaSubmissionResponse> {
    const {
      anonymousVisitorToken: token,
      idempotencyHash: keyHash,
      requestHash,
      authenticatedUserId: userId,
    } = flow;
    await this.releaseUsage(token, keyHash, reservation);
    try {
      const submissionCount = userId
        ? await this.repository.updateWorstIdea(
            match.ideaId,
            keyHash,
            requestHash,
            match.headline,
            userId,
          )
        : await this.repository.updateWorstIdea(
            match.ideaId,
            keyHash,
            requestHash,
            match.headline,
          );
      return {
        status: "similar_idea_match",
        headline: match.headline,
        safeTitle: match.semanticTitle,
        submissionCount,
      };
    } catch {
      this.logger.error("IDEA_SIMILARITY_COUNT_UPDATE_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
  }

  private async evaluateNewIdea(
    flow: SubmissionFlow,
    reservation: UsageReservation | undefined,
    embedding: readonly number[],
  ): Promise<IdeaSubmissionResponse> {
    const {
      request,
      anonymousVisitorToken: token,
      idempotencyHash: keyHash,
      requestHash,
      authenticatedUserId: userId,
    } = flow;
    try {
      const evaluationRequest = this.toEvaluationRequest(request);
      const result = userId
        ? await this.evaluation.evaluate(evaluationRequest, userId)
        : await this.evaluation.evaluate(evaluationRequest);
      if (result.status === "RECHAZADA") {
        await this.persistRejectedIdea(flow, result, embedding);
      }
      await this.persistApprovedIdeaIfNeeded(
        userId,
        keyHash,
        requestHash,
        request.ideaText,
        result,
      );
      const response: IdeaSubmissionResponse = { status: "evaluated", result };
      await this.commitUsage(
        token,
        keyHash,
        requestHash,
        response,
        reservation,
      );
      return response;
    } catch (error) {
      await this.releaseUsage(token, keyHash, reservation);
      throw error;
    }
  }

  private async persistRejectedIdea(
    flow: SubmissionFlow,
    result: EvaluationProcessResponse,
    embedding: readonly number[],
  ): Promise<void> {
    if (!result.safeTitle || result.score === null) {
      this.logger.error("IDEA_REJECTION_TITLE_UNAVAILABLE");
      throw new ServiceUnavailableException(INVALID_REJECTION_TITLE_RESPONSE);
    }
    try {
      const { idempotencyHash, requestHash, authenticatedUserId } = flow;
      if (authenticatedUserId) {
        await this.repository.addToWorstIdeas(
          result.safeTitle,
          result.score,
          embedding,
          idempotencyHash,
          requestHash,
          authenticatedUserId,
        );
      } else {
        await this.repository.addToWorstIdeas(
          result.safeTitle,
          result.score,
          embedding,
          idempotencyHash,
          requestHash,
        );
      }
    } catch {
      this.logger.error("IDEA_REJECTION_PERSISTENCE_FAILED");
      throw new ServiceUnavailableException(INVALID_REJECTION_TITLE_RESPONSE);
    }
  }

  private async reserveUsage(
    token: unknown,
    keyHash: string,
    requestHash: string,
    userId: string | undefined,
  ): Promise<UsageReservation | undefined> {
    if (userId) {
      if (!this.planUsage)
        throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
      const accountReservation = await this.planUsage.reserveIfPlanActive(
        userId,
        "ideas",
        keyHash,
        requestHash,
      );
      if (accountReservation)
        return { source: "account", userId, result: accountReservation };
    }
    const anonymousReservation = await this.anonymousUsage?.reserve(
      token,
      "ideas",
      keyHash,
      requestHash,
    );
    return { source: "anonymous", result: anonymousReservation };
  }

  private commitUsage(
    token: unknown,
    keyHash: string,
    requestHash: string,
    response: IdeaSubmissionResponse,
    reservation: UsageReservation | undefined,
  ) {
    if (reservation?.source === "account")
      return this.planUsage!.commit(
        reservation.userId,
        "ideas",
        keyHash,
        requestHash,
        response,
      );
    if (reservation?.source === "anonymous")
      return this.anonymousUsage?.commit(
        token,
        "ideas",
        keyHash,
        requestHash,
        response,
      );
  }

  private releaseUsage(
    token: unknown,
    keyHash: string,
    reservation: UsageReservation | undefined,
  ) {
    if (reservation?.source === "account")
      return this.planUsage!.release(reservation.userId, "ideas", keyHash);
    if (reservation?.source === "anonymous")
      return this.anonymousUsage?.release(token, "ideas", keyHash);
  }

  private async persistApprovedIdeaIfNeeded(
    userId: string | undefined,
    submissionHash: string,
    requestHash: string,
    ideaText: string,
    result: EvaluationProcessResponse,
  ): Promise<void> {
    if (!userId || result.status !== "SIN_BLOQUEO_EVIDENTE") return;
    if (!this.registrationRepository) {
      this.logger.error("APPROVED_IDEA_PERSISTENCE_UNAVAILABLE");
      throw new ServiceUnavailableException(APPROVED_IDEA_PERSISTENCE_ERROR);
    }
    let sameRequest: boolean;
    try {
      sameRequest = await this.registrationRepository.saveGoodIdea(
        userId,
        createApprovedIdeaTitle(ideaText),
        submissionHash,
        requestHash,
      );
    } catch {
      this.logger.error("APPROVED_IDEA_PERSISTENCE_FAILED");
      throw new ServiceUnavailableException(APPROVED_IDEA_PERSISTENCE_ERROR);
    }
    if (!sameRequest)
      throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
  }

  private toEvaluationRequest(request: EvaluationRequest) {
    return { ideaText: request.ideaText, tone: request.tone };
  }
}

function readAuthenticatedUserId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && USER_ID_PATTERN.test(value)) return value;
  throw new UnauthorizedException({
    code: "SESSION_REQUIRED",
    message: "Tu sesión no es válida. Inicia sesión para continuar.",
  });
}

function createApprovedIdeaTitle(ideaText: string): string {
  const withoutControlCharacters = Array.from(ideaText)
    .filter((character) => !isControlCharacter(character))
    .join("");
  return withoutControlCharacters
    .replace(APPROVED_IDEA_WHITESPACE_PATTERN, " ")
    .trim()
    .slice(0, APPROVED_IDEA_TITLE_LIMIT)
    .trimEnd();
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) return false;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function readCachedSubmission(input: unknown): IdeaSubmissionResponse {
  const specialCase = parseSpecialIdeaCaseResponse(input);
  if (specialCase) return specialCase;
  if (
    isRecord(input) &&
    input.status === "evaluated" &&
    isEvaluationProcessResponse(input.result)
  ) {
    return { status: "evaluated", result: input.result };
  }
  throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
}

function isEvaluationProcessResponse(
  input: unknown,
): input is EvaluationProcessResponse {
  return (
    isRecord(input) &&
    hasValidCachedCore(input) &&
    hasValidCachedSafeTitle(input) &&
    hasValidCachedProductExample(input) &&
    hasValidCachedFailedCriteria(input)
  );
}

function hasValidCachedCore(input: Record<string, unknown>): boolean {
  return (
    typeof input.status === "string" &&
    EVALUATION_STATUSES.has(input.status) &&
    typeof input.headline === "string" &&
    input.headline.trim().length > 0 &&
    input.headline.length <= MAX_CACHED_EVALUATION_HEADLINE_LENGTH &&
    typeof input.message === "string" &&
    input.message.trim().length > 0 &&
    input.message.length <= MAX_CACHED_EVALUATION_MESSAGE_LENGTH &&
    isValidCachedScore(input.score, input.status)
  );
}

function hasValidCachedSafeTitle(input: Record<string, unknown>): boolean {
  if (!Object.hasOwn(input, "safeTitle")) return input.status !== "RECHAZADA";
  return (
    input.status === "RECHAZADA" &&
    typeof input.safeTitle === "string" &&
    input.safeTitle.trim().length >= MIN_CACHED_EVALUATION_TITLE_LENGTH &&
    input.safeTitle.length <= MAX_CACHED_EVALUATION_TITLE_LENGTH
  );
}

function hasValidCachedProductExample(input: Record<string, unknown>): boolean {
  if (!Object.hasOwn(input, "existingProductExample")) return true;
  return (
    input.status === "RECHAZADA" &&
    typeof input.existingProductExample === "string" &&
    input.existingProductExample.length >= MIN_CACHED_PRODUCT_EXAMPLE_LENGTH &&
    input.existingProductExample.length <= MAX_CACHED_PRODUCT_EXAMPLE_LENGTH
  );
}

function hasValidCachedFailedCriteria(input: Record<string, unknown>): boolean {
  if (!Object.hasOwn(input, "failedCriteria")) return true;
  return (
    input.status === "RECHAZADA" &&
    Array.isArray(input.failedCriteria) &&
    input.failedCriteria.length > 0 &&
    input.failedCriteria.length <= MAX_CACHED_FAILED_CRITERIA &&
    !input.failedCriteria.some((criterion) => typeof criterion !== "string")
  );
}

function isValidCachedScore(score: unknown, status: string): boolean {
  if (status === "IDEA_INSUFICIENTE") return score === null;
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= 10
  );
}
