import "reflect-metadata";
import { Module } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { EVALUATION_PORT, type EvaluationPort } from "./evaluation-port";
import { EvaluationProcessController } from "./evaluation-process.controller";
import { EvaluationProcessService } from "./evaluation-process.service";
import { EvaluationTestingModule } from "./evaluation-testing.module";
import { IDEA_SUBMISSION_SEARCH } from "./idea-submission.tokens";
import { IdeaSubmissionService } from "./idea-submission.service";
import { WORST_IDEAS_REPOSITORY } from "../worst-ideas/worst-ideas.tokens";
import type { SearchSimilarIdea } from "../search-similar-idea/search-similar-idea";
import type { WorstIdeasRepository } from "../worst-ideas/worst-ideas.models";
import { ACCESS_TOKEN_SESSION_LOOKUP } from "../infrastructure/auth/access-token-session.lookup";
import { AccessTokenGuard } from "../infrastructure/auth/access-token.guard";
import { OptionalAccessTokenGuard } from "../infrastructure/auth/optional-access-token.guard";
import { issueAccessToken } from "../infrastructure/auth/access-token";
import { PlanUsageService } from "../register-with-plan/plan-usage.service";
import { FakeEvaluationPort } from "./fake-evaluation.port";

const AUTH_GUARD_TEST_PROVIDERS = [
  AccessTokenGuard,
  OptionalAccessTokenGuard,
  {
    provide: ACCESS_TOKEN_SESSION_LOOKUP,
    useValue: { isActive: async () => false },
  },
];

const VALID_IDEA = "Una app para coordinar voluntarios en el barrio";
const EVALUATION_PATH = "/api/evaluation-process";
const PREVIOUS_TIMEOUT = process.env.EVALUATION_TIMEOUT_MS;
const PREVIOUS_ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

const AUTHENTICATED_USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACCESS_TOKEN_SECRET = "plan-quota-http-test-secret-32-bytes-minimum";

function createAuthenticatedQuotaModule(planUsage: PlanUsageService) {
  @Module({
    controllers: [EvaluationProcessController],
    providers: [
      AccessTokenGuard,
      OptionalAccessTokenGuard,
      {
        provide: ACCESS_TOKEN_SESSION_LOOKUP,
        useValue: { isActive: async () => true },
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
          updateWorstIdea: async () => 1,
        },
      },
      { provide: PlanUsageService, useValue: planUsage },
      {
        provide: IdeaSubmissionService,
        useFactory: (
          search: SearchSimilarIdea,
          repository: WorstIdeasRepository,
          evaluation: EvaluationProcessService,
          quota: PlanUsageService,
        ) =>
          new IdeaSubmissionService(
            search,
            repository,
            evaluation,
            undefined,
            { saveGoodIdea: async () => true },
            quota,
          ),
        inject: [
          IDEA_SUBMISSION_SEARCH,
          WORST_IDEAS_REPOSITORY,
          EvaluationProcessService,
          PlanUsageService,
        ],
      },
    ],
  })
  class AuthenticatedQuotaTestingModule {}
  return AuthenticatedQuotaTestingModule;
}

@Module({
  controllers: [EvaluationProcessController],
  providers: [
    ...AUTH_GUARD_TEST_PROVIDERS,
    EvaluationProcessService,
    { provide: EVALUATION_PORT, useValue: undefined },
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
class UnavailableTestingModule {}

@Module({
  controllers: [EvaluationProcessController],
  providers: [
    ...AUTH_GUARD_TEST_PROVIDERS,
    EvaluationProcessService,
    {
      provide: EVALUATION_PORT,
      useValue: {
        evaluate: () => new Promise<unknown>(() => undefined),
      } satisfies EvaluationPort,
    },
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
class TimeoutTestingModule {}

async function startHttpApplication(
  module:
    | typeof AppModule
    | typeof EvaluationTestingModule
    | typeof TimeoutTestingModule
    | ReturnType<typeof createAuthenticatedQuotaModule>,
) {
  const application = await NestFactory.create<NestExpressApplication>(module, {
    logger: false,
    abortOnError: false,
  });
  application.setGlobalPrefix("api");
  await application.listen(0, "127.0.0.1");
  return application;
}

async function postEvaluation(
  application: NestExpressApplication,
  body: unknown,
) {
  const origin = await application.getUrl();
  return fetch(new URL(EVALUATION_PATH, origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "d54e74e8-4d23-46d4-9944-0b39bcda0914",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  if (PREVIOUS_TIMEOUT === undefined) {
    delete process.env.EVALUATION_TIMEOUT_MS;
  } else {
    process.env.EVALUATION_TIMEOUT_MS = PREVIOUS_TIMEOUT;
  }
});

describe("evaluation process HTTP endpoint", () => {
  it("checks and commits the authenticated Iluminado quota around successful evaluation", async () => {
    process.env.ACCESS_TOKEN_SECRET = ACCESS_TOKEN_SECRET;
    const planUsage = {
      reserveIfPlanActive: vi
        .fn()
        .mockResolvedValue({ state: "reserved" as const }),
      commit: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    };
    const application = await startHttpApplication(
      createAuthenticatedQuotaModule(planUsage as unknown as PlanUsageService),
    );

    try {
      const response = await fetch(
        new URL(EVALUATION_PATH, await application.getUrl()),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": "d54e74e8-4d23-46d4-9944-0b39bcda0914",
            Authorization: `Bearer ${issueAccessToken(AUTHENTICATED_USER_ID).token}`,
          },
          body: JSON.stringify({ ideaText: VALID_IDEA, tone: "soft" }),
        },
      );

      const body: unknown = await response.json();
      expect(response.status, JSON.stringify(body)).toBe(201);
      expect(body).toMatchObject({ status: "evaluated" });
      expect(JSON.stringify(body)).not.toContain(VALID_IDEA);
      expect(planUsage.reserveIfPlanActive).toHaveBeenCalledWith(
        AUTHENTICATED_USER_ID,
        "ideas",
        expect.stringMatching(/^[a-f0-9]{64}$/u),
        expect.stringMatching(/^[a-f0-9]{64}$/u),
      );
      expect(planUsage.commit).toHaveBeenCalledOnce();
    } finally {
      await application.close();
      if (PREVIOUS_ACCESS_TOKEN_SECRET === undefined)
        delete process.env.ACCESS_TOKEN_SECRET;
      else process.env.ACCESS_TOKEN_SECRET = PREVIOUS_ACCESS_TOKEN_SECRET;
    }
  });

  it("returns only the public evaluation fields for a valid request", async () => {
    const application = await startHttpApplication(EvaluationTestingModule);

    try {
      const response = await postEvaluation(application, {
        ideaText: VALID_IDEA,
        tone: "soft",
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({
        status: "evaluated",
        result: {
          status: "SIN_BLOQUEO_EVIDENTE",
          score: 6.77,
          headline: "¡Qué ilusión! Ha superado el primer repaso.",
          message:
            "¡Qué ilusión poder acompañarte con todo el cariño! Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.",
        },
      });
    } finally {
      await application.close();
    }
  });

  it("returns HTTP 400 for invalid request data without reflecting the input", async () => {
    const application = await startHttpApplication(EvaluationTestingModule);

    try {
      const response = await postEvaluation(application, {
        ideaText: "short",
        tone: "soft",
      });
      const body = await response.text();

      expect(response.status).toBe(400);
      expect(body).not.toContain("short");
    } finally {
      await application.close();
    }
  });

  it("returns HTTP 503 when the production application has no evaluator", async () => {
    const application = await startHttpApplication(UnavailableTestingModule);

    try {
      const response = await postEvaluation(application, {
        ideaText: VALID_IDEA,
        tone: "soft",
      });
      const body: unknown = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        code: "EVALUATOR_UNAVAILABLE",
        message: "El servicio de evaluación no está disponible ahora.",
      });
      expect(JSON.stringify(body)).not.toContain(VALID_IDEA);
    } finally {
      await application.close();
    }
  });

  it("returns HTTP 504 when the evaluation port exceeds its timeout", async () => {
    process.env.EVALUATION_TIMEOUT_MS = "1";
    const application = await startHttpApplication(TimeoutTestingModule);

    try {
      const response = await postEvaluation(application, {
        ideaText: VALID_IDEA,
        tone: "soft",
      });
      const body = await response.json();

      expect(response.status).toBe(504);
      expect(body).toMatchObject({ code: "EVALUATION_TIMEOUT" });
      expect(JSON.stringify(body)).not.toContain(VALID_IDEA);
    } finally {
      await application.close();
    }
  });
});
