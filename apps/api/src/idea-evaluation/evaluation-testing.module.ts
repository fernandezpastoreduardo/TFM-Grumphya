import { Module } from "@nestjs/common";
import { EvaluationProcessController } from "./evaluation-process.controller";
import { EvaluationTestReadinessController } from "./evaluation-test-readiness.controller";
import { EVALUATION_PORT } from "./evaluation-port";
import { EvaluationProcessService } from "./evaluation-process.service";
import { FakeEvaluationPort } from "./fake-evaluation.port";
import { IDEA_SUBMISSION_SEARCH } from "./idea-submission.tokens";
import { IdeaSubmissionService } from "./idea-submission.service";
import { WORST_IDEAS_REPOSITORY } from "../worst-ideas/worst-ideas.tokens";
import type { SearchSimilarIdea } from "../search-similar-idea/search-similar-idea";
import type { WorstIdeasRepository } from "../worst-ideas/worst-ideas.models";
import { ACCESS_TOKEN_SESSION_LOOKUP } from "../infrastructure/auth/access-token-session.lookup";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { OptionalAccessTokenGuard } from "../infrastructure/auth/optional-access-token.guard";

@Module({
  controllers: [EvaluationProcessController, EvaluationTestReadinessController],
  providers: [
    AccessTokenGuard,
    OptionalAccessTokenGuard,
    {
      provide: ACCESS_TOKEN_SESSION_LOOKUP,
      useValue: { isActive: async () => false },
    },
    EvaluationProcessService,
    FakeEvaluationPort,
    { provide: EVALUATION_PORT, useExisting: FakeEvaluationPort },
    {
      provide: IDEA_SUBMISSION_SEARCH,
      useValue: {
        executeDetailed: async () => ({
          result: { kind: "no-match" },
          embedding: [0.1],
        }),
      },
    },
    {
      provide: WORST_IDEAS_REPOSITORY,
      useValue: {
        addToWorstIdeas: async () => "test-idea",
        getIdempotentMatch: async () => null,
        hasDifferentIdempotentRequest: async () => false,
        claimIdempotentContinuation: async () => true,
        releaseIdempotentContinuation: async () => undefined,
        updateWorstIdea: async () => 1,
      },
    },
    {
      provide: IdeaSubmissionService,
      useFactory: (
        search: SearchSimilarIdea,
        repository: WorstIdeasRepository,
        evaluation: EvaluationProcessService,
      ) => new IdeaSubmissionService(search, repository, evaluation),
      inject: [
        IDEA_SUBMISSION_SEARCH,
        WORST_IDEAS_REPOSITORY,
        EvaluationProcessService,
      ],
    },
  ],
})
export class EvaluationTestingModule {}
