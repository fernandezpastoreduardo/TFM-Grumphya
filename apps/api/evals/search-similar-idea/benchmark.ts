import { OpenAiTextEmbeddingPort } from "../../src/infrastructure/ai/openai-text-embedding.port";
import { createPostgresPool } from "../../src/infrastructure/database/postgres-pool";
import { OpenAiIdeaEquivalencePort } from "../../src/search-similar-idea/openai-idea-equivalence.port";
import { OpenAiSemanticIdeaFingerprintPort } from "../../src/search-similar-idea/openai-semantic-idea-fingerprint.port";
import { PostgresWorstIdeasRepository } from "../../src/worst-ideas/postgres-worst-ideas.repository";
import { MAX_SEARCH_CANDIDATES } from "../../src/search-similar-idea/search-similar-idea";

const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const EXAMPLES = [
  {
    label: "cricket web paraphrase",
    ideaText: "Una web tipo Tinder pero para grillos",
    expectMatch: true,
  },
  {
    label: "grasshopper app paraphrase",
    ideaText: "Crear una app tipo Tinder pero para saltamontes",
    expectMatch: true,
  },
  {
    label: "unrelated cricket idea",
    ideaText: "Una app educativa para aprender sobre grillos",
    expectMatch: false,
  },
] as const;

async function runBenchmark(): Promise<void> {
  const apiKey = process.env[OPENAI_API_KEY_ENV]?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is unavailable.");

  const pool = createPostgresPool();
  try {
    const fingerprintPort = new OpenAiSemanticIdeaFingerprintPort({ apiKey });
    const embeddingPort = new OpenAiTextEmbeddingPort({ apiKey });
    const repository = new PostgresWorstIdeasRepository(pool);
    const equivalencePort = new OpenAiIdeaEquivalencePort({ apiKey });
    const results = [];
    for (const example of EXAMPLES) {
      const fingerprint = await fingerprintPort.createFingerprint(
        example.ideaText,
      );
      if (typeof fingerprint !== "string") {
        throw new Error("Semantic benchmark received an invalid fingerprint.");
      }
      const embedding = await embeddingPort.createEmbedding(fingerprint);
      if (
        !Array.isArray(embedding) ||
        !embedding.every(
          (coordinate: unknown) =>
            typeof coordinate === "number" && Number.isFinite(coordinate),
        )
      ) {
        throw new Error("Semantic benchmark received an invalid embedding.");
      }
      const candidates = await repository.searchRejected(
        embedding,
        MAX_SEARCH_CANDIDATES,
      );
      const candidateMatches = candidates.length
        ? await equivalencePort.classifyIdeas(
            example.ideaText,
            fingerprint,
            candidates.map(({ safeTitle }) => safeTitle),
          )
        : [];
      if (
        !Array.isArray(candidateMatches) ||
        candidateMatches.length !== candidates.length ||
        !candidateMatches.every((value) => typeof value === "boolean")
      ) {
        throw new Error("Semantic benchmark received an invalid comparison.");
      }
      const matchIndex = candidateMatches.findIndex((value) => value === true);
      const matched = matchIndex >= 0;
      const matchingCandidate = matched ? candidates[matchIndex] : undefined;
      results.push({
        label: example.label,
        expectMatch: example.expectMatch,
        matched,
        correct: matched === example.expectMatch,
        candidates: candidates.map((candidate, index) => ({
          safeTitle: candidate.safeTitle,
          similarity: Number(candidate.similarity.toFixed(4)),
          sameIdea: candidateMatches[index],
        })),
        ...(matchingCandidate
          ? {
              safeTitle: matchingCandidate.safeTitle,
              submissionCount: matchingCandidate.count,
              similarity: Number(matchingCandidate.similarity.toFixed(4)),
            }
          : {}),
      });
    }
    console.log(
      JSON.stringify(
        {
          cases: results.length,
          correct: results.filter(({ correct }) => correct).length,
          results,
          writesDatabase: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

void runBenchmark().catch((error: unknown) => {
  const safeMessage =
    error instanceof Error ? error.message : "Unknown benchmark failure.";
  console.error(`Similarity benchmark failed: ${safeMessage}`);
  process.exitCode = 1;
});
