export interface RejectedIdeaMatch {
  id: string;
  safeTitle: string;
  count: number;
  similarity: number;
  lastReceivedAt: Date;
  source: string;
  version: string;
  dimension: number;
}

export interface IdempotentRejectedIdeaMatch {
  id: string;
  safeTitle: string;
  count: number;
}

export type RejectedIdeaSubmissionType = "match" | "new_rejection";

export interface WorstIdeasRepository {
  searchRejected(
    embedding: readonly number[],
    limit: number,
  ): Promise<RejectedIdeaMatch[]>;
  addToWorstIdeas(
    safeTitle: string,
    embedding: readonly number[],
    idempotencyHash: string,
    requestHash: string,
  ): Promise<string>;
  getIdempotentMatch(
    idempotencyHash: string,
    requestHash: string,
  ): Promise<IdempotentRejectedIdeaMatch | null>;
  hasDifferentIdempotentRequest(
    idempotencyHash: string,
    requestHash: string,
  ): Promise<boolean>;
  claimIdempotentContinuation(
    idempotencyHash: string,
    requestHash: string,
  ): Promise<boolean>;
  updateWorstIdea(
    ideaId: string,
    idempotencyHash: string,
    requestHash: string,
  ): Promise<number>;
}
