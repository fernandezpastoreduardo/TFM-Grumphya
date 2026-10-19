export const MAX_SEARCH_CANDIDATES = 20;
const MIN_IDEA_LENGTH = 10;
const MAX_IDEA_LENGTH = 2000;
const MIN_FINGERPRINT_LENGTH = 8;
const MAX_FINGERPRINT_LENGTH = 400;
const INVALID_IDEA_MESSAGE = "Idea no válida para buscar coincidencias.";
const INVALID_EMBEDDING_MESSAGE = "Embedding no válido.";

export interface TextEmbeddingPort {
  createEmbedding(ideaText: string, userId?: string): Promise<unknown>;
}

export interface RejectedIdeaSearchPort {
  searchRejected(embedding: readonly number[], limit: number): Promise<unknown>;
}

export interface SemanticIdeaFingerprintPort {
  createFingerprint(ideaText: string, userId?: string): Promise<unknown>;
}

export interface IdeaEquivalencePort {
  classifyIdeas(
    ideaText: string,
    semanticFingerprint: string,
    safeTitles: readonly string[],
    userId?: string,
  ): Promise<unknown>;
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

function parseSemanticFingerprint(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.trim() !== input ||
    input.length < MIN_FINGERPRINT_LENGTH ||
    input.length > MAX_FINGERPRINT_LENGTH ||
    /[\p{Cc}\p{Cf}]/u.test(input)
  ) {
    throw new Error("Semantic idea fingerprint is invalid.");
  }
  return input;
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

function parseRejectedCandidates(candidates: unknown): RejectedIdeaCandidate[] {
  if (!Array.isArray(candidates)) return [];

  const validCandidates: RejectedIdeaCandidate[] = [];
  for (const candidate of candidates as unknown[]) {
    if (!isRejectedIdeaCandidate(candidate)) continue;
    validCandidates.push(candidate);
  }
  return validCandidates
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, MAX_SEARCH_CANDIDATES);
}

async function findBestEquivalentIdea(
  candidates: unknown,
  ideaText: string,
  semanticFingerprint: string,
  equivalencePort: IdeaEquivalencePort,
  userId?: string,
): Promise<SimilarIdeaSearchResult> {
  const validCandidates = parseRejectedCandidates(candidates);
  if (validCandidates.length === 0) return NO_MATCH;
  const candidateTitles = validCandidates.map(
    ({ semanticTitle }) => semanticTitle,
  );
  const classifications = userId
    ? await equivalencePort.classifyIdeas(
        ideaText,
        semanticFingerprint,
        candidateTitles,
        userId,
      )
    : await equivalencePort.classifyIdeas(
        ideaText,
        semanticFingerprint,
        candidateTitles,
      );
  if (
    !Array.isArray(classifications) ||
    classifications.length !== validCandidates.length ||
    !classifications.every(
      (classification) => typeof classification === "boolean",
    )
  ) {
    throw new Error("Semantic comparison response is invalid.");
  }
  const matchIndex = classifications.findIndex(
    (classification) => classification === true,
  );
  if (matchIndex !== -1) {
    const candidate = validCandidates[matchIndex]!;
    return {
      kind: "match",
      ideaId: candidate.ideaId,
      semanticTitle: candidate.semanticTitle,
      similarity: candidate.similarity,
      submissionCount: candidate.submissionCount,
    };
  }
  return NO_MATCH;
}

export type DetailedSimilarIdeaSearchResult = {
  result: SimilarIdeaSearchResult;
  embedding: readonly number[];
};

export class SearchSimilarIdea {
  constructor(
    private readonly fingerprintPort: SemanticIdeaFingerprintPort,
    private readonly embeddingPort: TextEmbeddingPort,
    private readonly searchPort: RejectedIdeaSearchPort,
    private readonly equivalencePort: IdeaEquivalencePort,
  ) {}

  async execute(input: unknown): Promise<SimilarIdeaSearchResult> {
    const detailedResult = await this.executeDetailed(input);
    return detailedResult.result;
  }

  async executeDetailed(
    input: unknown,
    userId?: string,
  ): Promise<DetailedSimilarIdeaSearchResult> {
    const ideaText = parseIdeaText(input);
    const fingerprintRequest = userId
      ? this.fingerprintPort.createFingerprint(ideaText, userId)
      : this.fingerprintPort.createFingerprint(ideaText);
    const semanticFingerprint = parseSemanticFingerprint(
      await fingerprintRequest,
    );
    const embeddingRequest = userId
      ? this.embeddingPort.createEmbedding(semanticFingerprint, userId)
      : this.embeddingPort.createEmbedding(semanticFingerprint);
    const embedding = parseEmbedding(await embeddingRequest);
    const candidates = await this.searchPort.searchRejected(
      embedding,
      MAX_SEARCH_CANDIDATES,
    );
    return {
      result: await findBestEquivalentIdea(
        candidates,
        ideaText,
        semanticFingerprint,
        this.equivalencePort,
        userId,
      ),
      embedding,
    };
  }
}
