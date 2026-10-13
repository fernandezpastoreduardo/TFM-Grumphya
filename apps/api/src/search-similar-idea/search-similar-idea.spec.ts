import { describe, expect, it, vi } from "vitest";
import {
  InvalidSimilarIdeaInputError,
  SearchSimilarIdea,
  type RejectedIdeaSearchPort,
  type TextEmbeddingPort,
} from "./search-similar-idea";

const VALID_IDEA = "Una app para coordinar voluntarios en el barrio";
const QUERY_VECTOR = [0.1, 0.2, 0.3];
const SAFE_REJECTED_IDEA = {
  ideaId: "idea-1",
  semanticTitle: "Servicio sin consentimiento para usar datos personales",
  similarity: 0.91,
  submissionCount: 23,
  verdict: "reject",
  isPublicTitleSafe: true,
};

function createUseCase(results: unknown) {
  const embeddingPort: TextEmbeddingPort = {
    createEmbedding: vi.fn().mockResolvedValue(QUERY_VECTOR),
  };
  const searchPort: RejectedIdeaSearchPort = {
    searchRejected: vi.fn().mockResolvedValue(results),
  };
  return {
    useCase: new SearchSimilarIdea(embeddingPort, searchPort),
    embeddingPort,
    searchPort,
  };
}

describe("SearchSimilarIdea", () => {
  it("embeds the validated idea and searches the rejected-idea corpus", async () => {
    const { useCase, embeddingPort, searchPort } = createUseCase([]);

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "no-match",
    });
    expect(embeddingPort.createEmbedding).toHaveBeenCalledWith(VALID_IDEA);
    expect(searchPort.searchRejected).toHaveBeenCalledWith(QUERY_VECTOR);
  });

  it("returns the closest rejected match above 0.90 with safe title and count", async () => {
    const { useCase } = createUseCase([
      { ...SAFE_REJECTED_IDEA, similarity: 0.91 },
      { ...SAFE_REJECTED_IDEA, ideaId: "idea-2", similarity: 0.94 },
    ]);

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "match",
      ideaId: "idea-2",
      semanticTitle:
        "Servicio sin consentimiento para usar datos personales",
      similarity: 0.94,
      submissionCount: 23,
    });
  });

  it("requires similarity to be strictly greater than 0.90", async () => {
    const { useCase } = createUseCase([
      { ...SAFE_REJECTED_IDEA, similarity: 0.9 },
    ]);

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "no-match",
    });
  });

  it("ignores candidates whose verdict is not reject", async () => {
    const { useCase } = createUseCase([
      { ...SAFE_REJECTED_IDEA, verdict: "promising" },
      { ...SAFE_REJECTED_IDEA, ideaId: "review-idea", verdict: "review" },
    ]);

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "no-match",
    });
  });

  it("does not expose a title that has not passed the safety check", async () => {
    const { useCase } = createUseCase([
      { ...SAFE_REJECTED_IDEA, isPublicTitleSafe: false },
    ]);

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "no-match",
    });
  });

  it("does not return any original text included by a repository", async () => {
    const { useCase } = createUseCase([
      {
        ...SAFE_REJECTED_IDEA,
        originalText: "Texto privado que no se debe devolver",
      },
    ]);

    const result = await useCase.execute({ ideaText: VALID_IDEA });

    expect(result).not.toHaveProperty("originalText");
    expect(result).not.toHaveProperty("normalizedText");
  });

  it("rejects invalid runtime input before calling its ports", async () => {
    const { useCase, embeddingPort, searchPort } = createUseCase([]);

    await expect(useCase.execute(null)).rejects.toBeInstanceOf(
      InvalidSimilarIdeaInputError,
    );
    await expect(useCase.execute({ ideaText: "corta" })).rejects.toBeInstanceOf(
      InvalidSimilarIdeaInputError,
    );
    await expect(
      useCase.execute({ ideaText: VALID_IDEA, userId: { malformed: true } }),
    ).rejects.toBeInstanceOf(InvalidSimilarIdeaInputError);
    expect(embeddingPort.createEmbedding).not.toHaveBeenCalled();
    expect(searchPort.searchRejected).not.toHaveBeenCalled();
  });

  it("rejects a malformed embedding from the embedding port", async () => {
    const embeddingPort: TextEmbeddingPort = {
      createEmbedding: vi.fn().mockResolvedValue([0.1, Number.NaN]),
    };
    const searchPort: RejectedIdeaSearchPort = {
      searchRejected: vi.fn().mockResolvedValue([]),
    };
    const useCase = new SearchSimilarIdea(embeddingPort, searchPort);

    await expect(useCase.execute({ ideaText: VALID_IDEA })).rejects.toThrow(
      "Embedding no válido.",
    );
    expect(searchPort.searchRejected).not.toHaveBeenCalled();
  });

  it("ignores malformed repository results safely", async () => {
    const { useCase } = createUseCase([
      null,
      { ...SAFE_REJECTED_IDEA, similarity: Number.POSITIVE_INFINITY },
      { ...SAFE_REJECTED_IDEA, submissionCount: -1 },
    ]);

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "no-match",
    });
  });
});
