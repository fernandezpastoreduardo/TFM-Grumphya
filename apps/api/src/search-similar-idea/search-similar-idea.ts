export const SIMILARITY_THRESHOLD = 0.9;
const MIN_IDEA_LENGTH = 10;
const MAX_IDEA_LENGTH = 2000;
const INVALID_IDEA_MESSAGE = "Idea no válida para buscar coincidencias.";
const INVALID_EMBEDDING_MESSAGE = "Embedding no válido.";

export interface TextEmbeddingPort {
  createEmbedding(ideaText: string): Promise<unknown>;
}

export interface RejectedIdeaSearchPort {
  searchRejected(embedding: readonly number[]): Promise<unknown>;
}

type RejectedIdeaCandidate = {
  ideaId: string;
  semanticTitle: string;
  similarity: number;
  submissionCount: number;
  verdict: "reject";
  isPublicTitleSafe: true;
};

export type SimilarIdeaSearchResult =
  | { kind: "no-match" }
  | {
      kind: "match";
      ideaId: string;
      semanticTitle: string;
      similarity: number;
      submissionCount: number;
    };

const NO_MATCH: SimilarIdeaSearchResult = { kind: "no-match" };

export class InvalidSimilarIdeaInputError extends Error {
  constructor() {
    super(INVALID_IDEA_MESSAGE);
    this.name = "InvalidSimilarIdeaInputError";
  }
}

export class InvalidIdeaEmbeddingError extends Error {
  constructor() {
    super(INVALID_EMBEDDING_MESSAGE);
    this.name = "InvalidIdeaEmbeddingError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIdeaText(input: unknown): string {
  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => key !== "ideaText") ||
    typeof input.ideaText !== "string"
  ) {
    throw new InvalidSimilarIdeaInputError();
  }

  const ideaText = input.ideaText.trim();
  if (ideaText.length < MIN_IDEA_LENGTH || ideaText.length > MAX_IDEA_LENGTH) {
    throw new InvalidSimilarIdeaInputError();
  }
  return ideaText;
}

function parseEmbedding(input: unknown): number[] {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    !input.every(
      (value: unknown) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    throw new InvalidIdeaEmbeddingError();
  }
  return input;
}

function isRejectedIdeaCandidate(
  value: unknown,
): value is RejectedIdeaCandidate {
  return (
    isRecord(value) &&
    typeof value.ideaId === "string" &&
    value.ideaId.length > 0 &&
    typeof value.semanticTitle === "string" &&
    value.semanticTitle.trim().length > 0 &&
    typeof value.similarity === "number" &&
    Number.isFinite(value.similarity) &&
    Number.isSafeInteger(value.submissionCount) &&
    Number(value.submissionCount) > 0 &&
    value.verdict === "reject" &&
    value.isPublicTitleSafe === true
  );
}

function getBestRejectedMatch(candidates: unknown): SimilarIdeaSearchResult {
  if (!Array.isArray(candidates)) return NO_MATCH;

  let bestMatch: RejectedIdeaCandidate | undefined;
  for (const candidate of candidates as unknown[]) {
    if (!isRejectedIdeaCandidate(candidate)) continue;
    if (candidate.similarity <= SIMILARITY_THRESHOLD) continue;
    if (!bestMatch || candidate.similarity > bestMatch.similarity) {
      bestMatch = candidate;
    }
  }

  if (!bestMatch) return NO_MATCH;
  return {
    kind: "match",
    ideaId: bestMatch.ideaId,
    semanticTitle: bestMatch.semanticTitle,
    similarity: bestMatch.similarity,
    submissionCount: bestMatch.submissionCount,
  };
}

export class SearchSimilarIdea {
  constructor(
    private readonly embeddingPort: TextEmbeddingPort,
    private readonly searchPort: RejectedIdeaSearchPort,
  ) {}

  async execute(input: unknown): Promise<SimilarIdeaSearchResult> {
    const ideaText = parseIdeaText(input);
    const embedding = parseEmbedding(
      await this.embeddingPort.createEmbedding(ideaText),
    );
    const candidates = await this.searchPort.searchRejected(embedding);
    return getBestRejectedMatch(candidates);
  }
}
