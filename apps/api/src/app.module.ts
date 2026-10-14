import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { EvaluationProcessController } from "./idea-evaluation/evaluation-process.controller";
import { createEvaluationProvider } from "./idea-evaluation/evaluation-provider.factory";
import { EVALUATION_PORT } from "./idea-evaluation/evaluation-port";
import { EvaluationProcessService } from "./idea-evaluation/evaluation-process.service";
import { IDEA_SUBMISSION_SEARCH } from "./idea-evaluation/idea-submission.tokens";
import { IdeaSubmissionService } from "./idea-evaluation/idea-submission.service";
import { OpenAiTextEmbeddingPort } from "./infrastructure/ai/openai-text-embedding.port";
import { TEXT_EMBEDDING_PORT } from "./infrastructure/ai/text-embedding.tokens";
import { createPostgresPool } from "./infrastructure/database/postgres-pool";
import { RegistrationModule } from "./register-with-plan/registration.module";
import { SearchSimilarIdea } from "./search-similar-idea/search-similar-idea";
import { OpenAiIdeaEquivalencePort } from "./search-similar-idea/openai-idea-equivalence.port";
import { OpenAiSemanticIdeaFingerprintPort } from "./search-similar-idea/openai-semantic-idea-fingerprint.port";
import { PostgresWorstIdeasRepository } from "./worst-ideas/postgres-worst-ideas.repository";
import type { WorstIdeasRepository } from "./worst-ideas/worst-ideas.models";
import { WORST_IDEAS_REPOSITORY } from "./worst-ideas/worst-ideas.tokens";

const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
function createTextEmbeddingProvider(): OpenAiTextEmbeddingPort | undefined {
  const apiKey = process.env[OPENAI_API_KEY_ENV]?.trim();
  return apiKey ? new OpenAiTextEmbeddingPort({ apiKey }) : undefined;
}

function createIdeaSearch(
  fingerprintPort: OpenAiSemanticIdeaFingerprintPort | undefined,
  embeddingPort: OpenAiTextEmbeddingPort | undefined,
  equivalencePort: OpenAiIdeaEquivalencePort | undefined,
  repository: WorstIdeasRepository,
) {
  if (!fingerprintPort || !embeddingPort || !equivalencePort) return undefined;
  return new SearchSimilarIdea(
    fingerprintPort,
    embeddingPort,
    {
      searchRejected: async (embedding, limit) => {
        const matches = await repository.searchRejected(embedding, limit);
        return matches.map((match) => ({
          ideaId: match.id,
          semanticTitle: match.safeTitle,
          similarity: match.similarity,
          submissionCount: match.count,
          verdict: "reject",
          isPublicTitleSafe: true,
        }));
      },
    },
    equivalencePort,
  );
}

function createIdeaEquivalenceProvider():
  OpenAiIdeaEquivalencePort | undefined {
  const apiKey = process.env[OPENAI_API_KEY_ENV]?.trim();
  return apiKey ? new OpenAiIdeaEquivalencePort({ apiKey }) : undefined;
}

function createSemanticIdeaFingerprintProvider():
  OpenAiSemanticIdeaFingerprintPort | undefined {
  const apiKey = process.env[OPENAI_API_KEY_ENV]?.trim();
  return apiKey ? new OpenAiSemanticIdeaFingerprintPort({ apiKey }) : undefined;
}

function createIdeaSubmissionService(
  search: SearchSimilarIdea | undefined,
  repository: WorstIdeasRepository,
  evaluation: EvaluationProcessService,
): IdeaSubmissionService {
  return new IdeaSubmissionService(search, repository, evaluation);
}

@Module({
  imports: [RegistrationModule],
  controllers: [HealthController, EvaluationProcessController],
  providers: [
    EvaluationProcessService,
    { provide: EVALUATION_PORT, useFactory: createEvaluationProvider },
    { provide: TEXT_EMBEDDING_PORT, useFactory: createTextEmbeddingProvider },
    {
      provide: OpenAiSemanticIdeaFingerprintPort,
      useFactory: createSemanticIdeaFingerprintProvider,
    },
    {
      provide: OpenAiIdeaEquivalencePort,
      useFactory: createIdeaEquivalenceProvider,
    },
    {
      provide: WORST_IDEAS_REPOSITORY,
      useFactory: () => new PostgresWorstIdeasRepository(createPostgresPool()),
    },
    {
      provide: IDEA_SUBMISSION_SEARCH,
      useFactory: createIdeaSearch,
      inject: [
        OpenAiSemanticIdeaFingerprintPort,
        TEXT_EMBEDDING_PORT,
        OpenAiIdeaEquivalencePort,
        WORST_IDEAS_REPOSITORY,
      ],
    },
    {
      provide: IdeaSubmissionService,
      useFactory: createIdeaSubmissionService,
      inject: [
        IDEA_SUBMISSION_SEARCH,
        WORST_IDEAS_REPOSITORY,
        EvaluationProcessService,
      ],
    },
  ],
})
export class AppModule {}
