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
  ): Promise<string>;
  getIdempotentMatch(
    idempotencyHash: string,
  ): Promise<IdempotentRejectedIdeaMatch | null>;
  claimIdempotentContinuation(idempotencyHash: string): Promise<boolean>;
  updateWorstIdea(ideaId: string, idempotencyHash: string): Promise<number>;
}
