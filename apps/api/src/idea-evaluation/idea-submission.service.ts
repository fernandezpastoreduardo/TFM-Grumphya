import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { SearchSimilarIdea } from "../search-similar-idea/search-similar-idea";
import type { WorstIdeasRepository } from "../worst-ideas/worst-ideas.models";
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

@Injectable()
export class IdeaSubmissionService {
  private readonly logger = new Logger(IdeaSubmissionService.name);

  constructor(
    private readonly search: SearchSimilarIdea | undefined,
    private readonly repository: WorstIdeasRepository,
    private readonly evaluation: EvaluationProcessService,
  ) {}

  async submit(
    input: unknown,
    idempotencyKeyInput: unknown,
  ): Promise<IdeaSubmissionResponse> {
    const request = parseRequest(input);
    if (
      typeof idempotencyKeyInput !== "string" ||
      !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKeyInput)
    ) {
      throw new BadRequestException(INVALID_REQUEST_RESPONSE);
    }
    const idempotencyHash = hashIdempotencyKey(idempotencyKeyInput);

    if (request.continueAnyway) {
      return this.continueAfterMatch(request, idempotencyHash);
    }

    return this.checkAndSubmit(request, idempotencyHash);
  }

  private async continueAfterMatch(
    request: EvaluationRequest,
    idempotencyHash: string,
  ): Promise<IdeaSubmissionResponse> {
    let previousMatch;
    try {
      previousMatch = await this.repository.getIdempotentMatch(idempotencyHash);
    } catch {
      this.logger.error("IDEA_CONTINUATION_LOOKUP_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    if (!previousMatch) {
      throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
    }

    let continuationClaimed: boolean;
    try {
      continuationClaimed =
        await this.repository.claimIdempotentContinuation(idempotencyHash);
    } catch {
      this.logger.error("IDEA_CONTINUATION_CLAIM_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    if (!continuationClaimed) {
      throw new ConflictException(INVALID_CONTINUATION_RESPONSE);
    }

    const result = await this.evaluation.evaluate(
      this.toEvaluationRequest(request),
    );
    return { status: "evaluated", result };
  }

  private async checkAndSubmit(
    request: EvaluationRequest,
    idempotencyHash: string,
  ): Promise<IdeaSubmissionResponse> {
    if (!this.search) {
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }
    let detailedSearch;
    try {
      detailedSearch = await this.search.executeDetailed({
        ideaText: request.ideaText,
      });
    } catch {
      this.logger.error("IDEA_SIMILARITY_CHECK_FAILED");
      throw new ServiceUnavailableException(SIMILARITY_UNAVAILABLE_RESPONSE);
    }

    if (detailedSearch.result.kind === "match") {
      try {
        const submissionCount = await this.repository.updateWorstIdea(
          detailedSearch.result.ideaId,
          idempotencyHash,
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

    const result = await this.evaluation.evaluate(
      this.toEvaluationRequest(request),
    );
    if (result.status !== "RECHAZADA") {
      return { status: "evaluated", result };
    }
    if (!result.safeTitle) {
      this.logger.error("IDEA_REJECTION_TITLE_UNAVAILABLE");
      throw new ServiceUnavailableException(INVALID_REJECTION_TITLE_RESPONSE);
    }

    try {
      await this.repository.addToWorstIdeas(
        result.safeTitle,
        detailedSearch.embedding,
        idempotencyHash,
      );
    } catch {
      this.logger.error("IDEA_REJECTION_PERSISTENCE_FAILED");
      throw new ServiceUnavailableException(INVALID_REJECTION_TITLE_RESPONSE);
    }

    return { status: "evaluated", result };
  }

  private toEvaluationRequest(request: EvaluationRequest) {
    return { ideaText: request.ideaText, tone: request.tone };
  }
}
