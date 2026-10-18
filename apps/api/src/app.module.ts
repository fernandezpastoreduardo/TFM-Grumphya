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
import {
  REGISTRATION_REPOSITORY,
  type RegistrationRepository,
} from "./register-with-plan/registration.repository";
import { AnonymousUsageController } from "./manage-user-unknow/anonymous-usage.controller";
import { ANONYMOUS_USAGE_REPOSITORY } from "./manage-user-unknow/anonymous-usage.models";
import { PostgresAnonymousUsageRepository } from "./manage-user-unknow/postgres-anonymous-usage.repository";
import { AnonymousUsageService } from "./manage-user-unknow/anonymous-usage.service";
import { SearchSimilarIdea } from "./search-similar-idea/search-similar-idea";
import { OpenAiIdeaEquivalencePort } from "./search-similar-idea/openai-idea-equivalence.port";
import { OpenAiSemanticIdeaFingerprintPort } from "./search-similar-idea/openai-semantic-idea-fingerprint.port";
import { PostgresWorstIdeasRepository } from "./worst-ideas/postgres-worst-ideas.repository";
import type { WorstIdeasRepository } from "./worst-ideas/worst-ideas.models";
import { WORST_IDEAS_REPOSITORY } from "./worst-ideas/worst-ideas.tokens";
import { GetIdeaListWorstAll } from "./worst-ideas/get-idea-list-worst-all.service";
import { GetIdeaListWorstAllController } from "./worst-ideas/get-idea-list-worst-all.controller";
import { GetIdeaListWorstUserController } from "./worst-ideas/get-idea-list-worst-user.controller";
import { GetIdeaListWorstUser } from "./worst-ideas/get-idea-list-worst-user.service";
import { UserDeleteModule } from "./user-delete/user-delete.module";
import { AuthSecurityModule } from "./infrastructure/auth/auth-security.module";
import { PlanUsageService } from "./register-with-plan/plan-usage.service";
import { ROAST_REPLY_PORT } from "./roast/roast-reply.port";
import { OpenAiRoastReplyPort } from "./roast/openai-roast-reply.port";
import { GetRoastRanking } from "./roast/get-roast-ranking.service";
import { GetRoastRankingController } from "./roast/get-roast-ranking.controller";
import { ROAST_RANKING_REPOSITORY } from "./roast/roast-ranking.models";
import { PostgresRoastRankingRepository } from "./roast/postgres-roast-ranking.repository";

const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
function createRoastReplyProvider(): OpenAiRoastReplyPort | undefined {
  const apiKey = process.env[OPENAI_API_KEY_ENV]?.trim();
  return apiKey ? new OpenAiRoastReplyPort({ apiKey }) : undefined;
}

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
  usage: AnonymousUsageService,
  registration: RegistrationRepository,
  planUsage: PlanUsageService,
): IdeaSubmissionService {
  return new IdeaSubmissionService(
    search,
    repository,
    evaluation,
    usage,
    registration,
    planUsage,
  );
}

@Module({
  imports: [AuthSecurityModule, RegistrationModule, UserDeleteModule],
  controllers: [
    HealthController,
    EvaluationProcessController,
    AnonymousUsageController,
    GetIdeaListWorstAllController,
    GetIdeaListWorstUserController,
    GetRoastRankingController,
  ],
  providers: [
    EvaluationProcessService,
    { provide: EVALUATION_PORT, useFactory: createEvaluationProvider },
    { provide: ROAST_REPLY_PORT, useFactory: createRoastReplyProvider },
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
      provide: ANONYMOUS_USAGE_REPOSITORY,
      useFactory: () =>
        new PostgresAnonymousUsageRepository(createPostgresPool()),
    },
    AnonymousUsageService,
    GetIdeaListWorstAll,
    GetIdeaListWorstUser,
    GetRoastRanking,
    {
      provide: ROAST_RANKING_REPOSITORY,
      useFactory: () =>
        new PostgresRoastRankingRepository(createPostgresPool()),
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
        AnonymousUsageService,
        REGISTRATION_REPOSITORY,
        PlanUsageService,
      ],
    },
  ],
})
export class AppModule {}
