import { createHash, createHmac } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { SearchSimilarIdea } from "../search-similar-idea/search-similar-idea";
import type { WorstIdeasRepository } from "../worst-ideas/worst-ideas.models";
import type { AnonymousUsageService } from "../manage-user-unknow/anonymous-usage.service";
import {
  InvalidEvaluationInputError,
  normalizeAndValidateRequest,
} from "./evaluation-process";
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

type EvaluationRequest = ReturnType<typeof normalizeAndValidateRequest>;

export type IdeaSubmissionResponse =
  | {
      status: "similar_idea_match";
      safeTitle: string;
      submissionCount: number;
    }
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

  try {
    return {
      ...normalizeAndValidateRequest({
        ideaText: input.ideaText,
        tone: input.tone,
      }),
      continueAnyway: input.continueAnyway === true,
    };
  } catch (error) {
    if (!(error instanceof InvalidEvaluationInputError)) throw error;
    throw new BadRequestException(INVALID_REQUEST_RESPONSE);
  }
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
  ) {}

  async submit(
    input: unknown,
    idempotencyKeyInput: unknown,
    anonymousVisitorToken?: unknown,
  ): Promise<IdeaSubmissionResponse> {
    const request = parseRequest(input);
    if (
      typeof idempotencyKeyInput !== "string" ||
      !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKeyInput)
    ) {
      throw new BadRequestException(INVALID_REQUEST_RESPONSE);
    }
    const idempotencyHash = hashIdempotencyKey(idempotencyKeyInput);
    const requestHash = hashSubmissionRequest(request, idempotencyKeyInput);
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
      );
    }

    return this.checkAndSubmit(
      request,
      idempotencyHash,
      requestHash,
      anonymousVisitorToken,
    );
  }

  private async continueAfterMatch(
    request: EvaluationRequest,
    idempotencyHash: string,
    requestHash: string,
    anonymousVisitorToken: unknown,
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
    );
    if (reservation?.state === "cached")
      return readCachedSubmission(reservation.response);

    let continuationClaimed: boolean;
    try {
      continuationClaimed = await this.repository.claimIdempotentContinuation(
        idempotencyHash,
        requestHash,
      );
    } catch {
      await this.releaseUsage(anonymousVisitorToken, idempotencyHash);
      this.logger.error("IDEA_CONTINUATION_CLAIM_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    if (!continuationClaimed) {
      await this.releaseUsage(anonymousVisitorToken, idempotencyHash);
      throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
    }

    try {
      const result = await this.evaluation.evaluate(
        this.toEvaluationRequest(request),
      );
      const response: IdeaSubmissionResponse = { status: "evaluated", result };
      await this.commitUsage(
        anonymousVisitorToken,
        idempotencyHash,
        requestHash,
        response,
      );
      return response;
    } catch (error) {
      await this.releaseUsage(anonymousVisitorToken, idempotencyHash);
      throw error;
    }
  }

  private async checkAndSubmit(
    request: EvaluationRequest,
    idempotencyHash: string,
    requestHash: string,
    anonymousVisitorToken: unknown,
  ): Promise<IdeaSubmissionResponse> {
    try {
      const previousMatch = await this.repository.getIdempotentMatch(
        idempotencyHash,
        requestHash,
      );
      if (previousMatch) {
        return {
          status: "similar_idea_match",
          safeTitle: previousMatch.safeTitle,
          submissionCount: previousMatch.count,
        };
      }
    } catch {
      this.logger.error("IDEA_IDEMPOTENCY_LOOKUP_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    const reservation = await this.reserveUsage(
      anonymousVisitorToken,
      idempotencyHash,
      requestHash,
    );
    if (reservation?.state === "cached")
      return readCachedSubmission(reservation.response);
    if (!this.search) {
      await this.releaseUsage(anonymousVisitorToken, idempotencyHash);
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    let detailedSearch;
    try {
      detailedSearch = await this.search.executeDetailed({
        ideaText: request.ideaText,
      });
    } catch {
      await this.releaseUsage(anonymousVisitorToken, idempotencyHash);
      this.logger.error("IDEA_SIMILARITY_CHECK_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }

    if (detailedSearch.result.kind === "match") {
      await this.releaseUsage(anonymousVisitorToken, idempotencyHash);
      try {
        const submissionCount = await this.repository.updateWorstIdea(
          detailedSearch.result.ideaId,
          idempotencyHash,
          requestHash,
        );
        return {
          status: "similar_idea_match",
          safeTitle: detailedSearch.result.semanticTitle,
          submissionCount,
        };
      } catch {
        this.logger.error("IDEA_SIMILARITY_COUNT_UPDATE_FAILED");
        throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
      }
    }

    try {
      const result = await this.evaluation.evaluate(
        this.toEvaluationRequest(request),
      );
      if (result.status === "RECHAZADA") {
        if (!result.safeTitle) {
          this.logger.error("IDEA_REJECTION_TITLE_UNAVAILABLE");
          throw new ServiceUnavailableException(
            INVALID_REJECTION_TITLE_RESPONSE,
          );
        }
        try {
          await this.repository.addToWorstIdeas(
            result.safeTitle,
            detailedSearch.embedding,
            idempotencyHash,
            requestHash,
          );
        } catch {
          this.logger.error("IDEA_REJECTION_PERSISTENCE_FAILED");
          throw new ServiceUnavailableException(
            INVALID_REJECTION_TITLE_RESPONSE,
          );
        }
      }
      const response: IdeaSubmissionResponse = { status: "evaluated", result };
      await this.commitUsage(
        anonymousVisitorToken,
        idempotencyHash,
        requestHash,
        response,
      );
      return response;
    } catch (error) {
      await this.releaseUsage(anonymousVisitorToken, idempotencyHash);
      throw error;
    }
  }

  private reserveUsage(token: unknown, keyHash: string, requestHash: string) {
    return this.anonymousUsage?.reserve(token, "ideas", keyHash, requestHash);
  }

  private commitUsage(
    token: unknown,
    keyHash: string,
    requestHash: string,
    response: IdeaSubmissionResponse,
  ) {
    return this.anonymousUsage?.commit(
      token,
      "ideas",
      keyHash,
      requestHash,
      response,
    );
  }

  private releaseUsage(token: unknown, keyHash: string) {
    return this.anonymousUsage?.release(token, "ideas", keyHash);
  }

  private toEvaluationRequest(request: EvaluationRequest) {
    return { ideaText: request.ideaText, tone: request.tone };
  }
}

function readCachedSubmission(input: unknown): IdeaSubmissionResponse {
  if (
    typeof input === "object" &&
    input !== null &&
    "status" in input &&
    input.status === "evaluated" &&
    "result" in input
  ) {
    return input as IdeaSubmissionResponse;
  }
  throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
}
