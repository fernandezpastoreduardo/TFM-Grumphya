import { describe, expect, it, vi } from "vitest";
import {
  InvalidSimilarIdeaInputError,
  MAX_SEARCH_CANDIDATES,
  SearchSimilarIdea,
  type IdeaEquivalencePort,
  type RejectedIdeaSearchPort,
  type SemanticIdeaFingerprintPort,
  type TextEmbeddingPort,
} from "./search-similar-idea";

const VALID_IDEA = "Una app para coordinar voluntarios en el barrio";
const SEMANTIC_FINGERPRINT =
  "Aplicación de coordinación de voluntariado para organizar personas y tareas en un barrio.";
const QUERY_VECTOR = [0.1, 0.2, 0.3];
const GENERATED_HEADLINE = "La idea vuelve con el mismo equipaje.";
const SAFE_REJECTED_IDEA = {
  ideaId: "idea-1",
  semanticTitle: "Servicio sin consentimiento para usar datos personales",
  similarity: 0.31,
  submissionCount: 23,
  verdict: "reject",
  isPublicTitleSafe: true,
};

function createUseCase(results: unknown) {
  const fingerprintPort: SemanticIdeaFingerprintPort = {
    createFingerprint: vi.fn().mockResolvedValue(SEMANTIC_FINGERPRINT),
  };
  const embeddingPort: TextEmbeddingPort = {
    createEmbedding: vi.fn().mockResolvedValue(QUERY_VECTOR),
  };
  const searchPort: RejectedIdeaSearchPort = {
    searchRejected: vi.fn().mockResolvedValue(results),
  };
  const equivalencePort: IdeaEquivalencePort = {
    classifyIdeas: vi.fn().mockResolvedValue({
      decisions: Array.isArray(results) ? results.map(() => true) : [],
      headline: GENERATED_HEADLINE,
    }),
  };
  return {
    useCase: new SearchSimilarIdea(
      fingerprintPort,
      embeddingPort,
      searchPort,
      equivalencePort,
    ),
    fingerprintPort,
    embeddingPort,
    searchPort,
    equivalencePort,
  };
}

describe("SearchSimilarIdea", () => {
  it("uses one semantic fingerprint for embedding, persistence, and search", async () => {
    const embedding = [0.12, 0.34, 0.56];
    const fingerprintPort = {
      createFingerprint: vi.fn().mockResolvedValue(SEMANTIC_FINGERPRINT),
    };
    const embeddingPort = {
      createEmbedding: vi.fn().mockResolvedValue(embedding),
    };
    const searchPort = { searchRejected: vi.fn().mockResolvedValue([]) };
    const equivalencePort = {
      classifyIdeas: vi
        .fn()
        .mockResolvedValue({ decisions: [], headline: null }),
    };
    const search = new SearchSimilarIdea(
      fingerprintPort,
      embeddingPort,
      searchPort,
      equivalencePort,
    );

    const detailed = await search.executeDetailed({ ideaText: VALID_IDEA });

    expect(fingerprintPort.createFingerprint).toHaveBeenCalledWith(VALID_IDEA);
    expect(embeddingPort.createEmbedding).toHaveBeenCalledWith(
      SEMANTIC_FINGERPRINT,
    );
    expect(searchPort.searchRejected).toHaveBeenCalledWith(
      embedding,
      MAX_SEARCH_CANDIDATES,
    );
    expect(detailed).toEqual({ result: { kind: "no-match" }, embedding });
  });

  it("recognizes a web and app paraphrase below 0.90 after the model confirms the same idea", async () => {
    const { equivalencePort } = createUseCase([
      { ...SAFE_REJECTED_IDEA, similarity: 0.31 },
    ]);
    const query = "Una web tipo tinder pero para grillos";
    const fingerprint =
      "Servicio web de citas para que los grillos encuentren pareja.";
    vi.mocked(equivalencePort.classifyIdeas).mockResolvedValue({
      decisions: [true],
      headline: GENERATED_HEADLINE,
    });
    const fingerprintPort = {
      createFingerprint: vi.fn().mockResolvedValue(fingerprint),
    };
    const embeddingPort = {
      createEmbedding: vi.fn().mockResolvedValue(QUERY_VECTOR),
    };
    const searchPort = {
      searchRejected: vi
        .fn()
        .mockResolvedValue([{ ...SAFE_REJECTED_IDEA, similarity: 0.31 }]),
    };
    const search = new SearchSimilarIdea(
      fingerprintPort,
      embeddingPort,
      searchPort,
      equivalencePort,
    );

    await expect(search.execute({ ideaText: query })).resolves.toMatchObject({
      kind: "match",
      headline: GENERATED_HEADLINE,
      ideaId: "idea-1",
      semanticTitle: SAFE_REJECTED_IDEA.semanticTitle,
    });
    expect(equivalencePort.classifyIdeas).toHaveBeenCalledWith(
      query,
      fingerprint,
      [SAFE_REJECTED_IDEA.semanticTitle],
      undefined,
      "hard",
    );
  });

  it("retrieves candidates by rank without a hard similarity cutoff", async () => {
    const { useCase, equivalencePort, searchPort } = createUseCase([
      { ...SAFE_REJECTED_IDEA, similarity: 0.01 },
    ]);
    vi.mocked(equivalencePort.classifyIdeas).mockResolvedValue({
      decisions: [false],
      headline: null,
    });

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "no-match",
    });
    expect(searchPort.searchRejected).toHaveBeenCalledWith(
      QUERY_VECTOR,
      MAX_SEARCH_CANDIDATES,
    );
    expect(equivalencePort.classifyIdeas).toHaveBeenCalledOnce();
  });

  it("returns the closest candidate confirmed as the same idea", async () => {
    const { useCase, equivalencePort } = createUseCase([
      { ...SAFE_REJECTED_IDEA, similarity: 0.1 },
      { ...SAFE_REJECTED_IDEA, ideaId: "idea-2", similarity: 0.4 },
    ]);
    vi.mocked(equivalencePort.classifyIdeas).mockResolvedValue({
      decisions: [true, false],
      headline: GENERATED_HEADLINE,
    });

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "match",
      headline: GENERATED_HEADLINE,
      ideaId: "idea-2",
      semanticTitle: SAFE_REJECTED_IDEA.semanticTitle,
      similarity: 0.4,
      submissionCount: 23,
    });
  });

  it("sorts candidates by similarity before matching and ignores unsafe candidates", async () => {
    const { useCase, equivalencePort } = createUseCase([
      { ...SAFE_REJECTED_IDEA, ideaId: "lower-ranked", similarity: 0.2 },
      { ...SAFE_REJECTED_IDEA, ideaId: "top-ranked", similarity: 0.8 },
      {
        ...SAFE_REJECTED_IDEA,
        ideaId: "unsafe",
        isPublicTitleSafe: false,
        similarity: 0.99,
      },
    ]);
    vi.mocked(equivalencePort.classifyIdeas).mockResolvedValue({
      decisions: [true, false],
      headline: GENERATED_HEADLINE,
    });

    await expect(
      useCase.execute({ ideaText: VALID_IDEA }),
    ).resolves.toMatchObject({
      kind: "match",
      ideaId: "top-ranked",
      similarity: 0.8,
    });
    expect(equivalencePort.classifyIdeas).toHaveBeenCalledWith(
      VALID_IDEA,
      SEMANTIC_FINGERPRINT,
      [SAFE_REJECTED_IDEA.semanticTitle, SAFE_REJECTED_IDEA.semanticTitle],
      undefined,
      "hard",
    );
  });

  it("returns no match without invoking the comparator when there are no valid candidates", async () => {
    const { useCase, equivalencePort } = createUseCase([
      { ...SAFE_REJECTED_IDEA, submissionCount: 0 },
      { ...SAFE_REJECTED_IDEA, verdict: "promising" },
    ]);

    await expect(useCase.execute({ ideaText: VALID_IDEA })).resolves.toEqual({
      kind: "no-match",
    });
    expect(equivalencePort.classifyIdeas).not.toHaveBeenCalled();
  });

  it("fails closed when the semantic comparator returns malformed data", async () => {
    const { useCase, equivalencePort } = createUseCase([
      { ...SAFE_REJECTED_IDEA, similarity: 0.4 },
    ]);
    vi.mocked(equivalencePort.classifyIdeas).mockResolvedValue({
      decisions: ["same"],
      headline: GENERATED_HEADLINE,
    });

    await expect(useCase.execute({ ideaText: VALID_IDEA })).rejects.toThrow(
      "Semantic comparison response is invalid.",
    );
  });

  it("does not call embedding or search ports for malformed public input", async () => {
    const { useCase, fingerprintPort, embeddingPort, searchPort } =
      createUseCase([]);

    await expect(useCase.execute(null)).rejects.toBeInstanceOf(
      InvalidSimilarIdeaInputError,
    );
    await expect(useCase.execute({ ideaText: "corta" })).rejects.toBeInstanceOf(
      InvalidSimilarIdeaInputError,
    );
    await expect(
      useCase.execute({ ideaText: VALID_IDEA, userId: { malformed: true } }),
    ).rejects.toBeInstanceOf(InvalidSimilarIdeaInputError);
    expect(fingerprintPort.createFingerprint).not.toHaveBeenCalled();
    expect(embeddingPort.createEmbedding).not.toHaveBeenCalled();
    expect(searchPort.searchRejected).not.toHaveBeenCalled();
  });

  it("rejects malformed fingerprints and embeddings before querying pgvector", async () => {
    const invalidFingerprintUseCase = new SearchSimilarIdea(
      { createFingerprint: vi.fn().mockResolvedValue("short") },
      { createEmbedding: vi.fn().mockResolvedValue(QUERY_VECTOR) },
      { searchRejected: vi.fn().mockResolvedValue([]) },
      { classifyIdeas: vi.fn().mockResolvedValue([]) },
    );
    const invalidEmbeddingUseCase = new SearchSimilarIdea(
      {
        createFingerprint: vi.fn().mockResolvedValue(SEMANTIC_FINGERPRINT),
      },
      { createEmbedding: vi.fn().mockResolvedValue([0.1, Number.NaN]) },
      { searchRejected: vi.fn().mockResolvedValue([]) },
      { classifyIdeas: vi.fn().mockResolvedValue([]) },
    );

    await expect(
      invalidFingerprintUseCase.execute({ ideaText: VALID_IDEA }),
    ).rejects.toThrow("Semantic idea fingerprint is invalid.");
    await expect(
      invalidEmbeddingUseCase.execute({ ideaText: VALID_IDEA }),
    ).rejects.toThrow("Embedding no válido.");
  });

  it("does not expose original text or embeddings in search results", async () => {
    const { useCase } = createUseCase([
      {
        ...SAFE_REJECTED_IDEA,
        similarity: 0.4,
        originalText: "Texto privado que no se debe devolver",
      },
    ]);

    const result = await useCase.execute({ ideaText: VALID_IDEA });

    expect(result).not.toHaveProperty("originalText");
    expect(result).not.toHaveProperty("normalizedText");
    expect(result).not.toHaveProperty("embedding");
  });
});
