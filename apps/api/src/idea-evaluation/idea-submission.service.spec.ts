import { ConflictException, BadRequestException } from "@nestjs/common";
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SearchSimilarIdea } from "../search-similar-idea/search-similar-idea";
import type { WorstIdeasRepository } from "../worst-ideas/worst-ideas.models";
import type { EvaluationProcessService } from "./evaluation-process.service";
import { IdeaSubmissionService } from "./idea-submission.service";
import type { PlanUsageService } from "../register-with-plan/plan-usage.service";
import type { AnonymousUsageService } from "../manage-user-unknow/anonymous-usage.service";

const IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const GRASSHOPPER_PARAPHRASE =
  "hacer un tinder pero en lugar de para personas para saltamontes";
const IDEMPOTENCY_KEY = "d54e74e8-4d23-46d4-9944-0b39bcda0914";
const UPPERCASE_IDEMPOTENCY_KEY = IDEMPOTENCY_KEY.toUpperCase();
const SAFE_TITLE = "Coordinación sin salvaguardas verificables";
const EVALUATION_RESULT = {
  status: "RECHAZADA" as const,
  score: 1.3,
  headline: "Vaya, justo falla donde más importa.",
  message:
    "Acceder sin permiso a datos convierte el servicio en una invasión directa de la privacidad de sus usuarios.",
  safeTitle: SAFE_TITLE,
};
const PROMISING_EVALUATION_RESULT = {
  status: "SIN_BLOQUEO_EVIDENTE" as const,
  score: 82,
  headline: "La idea supera el primer filtro.",
  message: "Los riesgos principales se pueden comprobar con pruebas pequeñas.",
};
const VALID_REQUEST = { ideaText: IDEA_TEXT, tone: "soft" as const };
const EMBEDDING = [0.1, 0.2, 0.3];
const IDEMPOTENCY_HASH = createHash("sha256")
  .update(IDEMPOTENCY_KEY)
  .digest("hex");
const REQUEST_HASH = createHmac("sha256", IDEMPOTENCY_KEY)
  .update(JSON.stringify({ ideaText: IDEA_TEXT, tone: "soft" }))
  .digest("hex");
const AUTHENTICATED_USER_ID = "00000000-0000-4000-8000-000000000001";

function createDependencies(
  searchResult: unknown = { kind: "no-match" },
  evaluationResult: unknown = EVALUATION_RESULT,
  planUsage?: PlanUsageService,
  anonymousUsage?: AnonymousUsageService,
) {
  const search = {
    executeDetailed: vi.fn().mockResolvedValue({
      result: searchResult,
      embedding: EMBEDDING,
    }),
  } as unknown as SearchSimilarIdea;
  const repository = {
    addToWorstIdeas: vi.fn().mockResolvedValue("idea-created"),
    updateWorstIdea: vi.fn().mockResolvedValue(24),
    getIdempotentMatch: vi.fn().mockResolvedValue(null),
    claimIdempotentContinuation: vi.fn().mockResolvedValue(true),
    hasDifferentIdempotentRequest: vi.fn().mockResolvedValue(false),
  } as unknown as WorstIdeasRepository;
  const evaluation = {
    evaluate: vi.fn().mockResolvedValue(evaluationResult),
  } as unknown as EvaluationProcessService;
  const goodIdeas = { saveGoodIdea: vi.fn().mockResolvedValue(true) };
  const planQuota = planUsage ?? {
    reserveIfPlanActive: vi.fn().mockResolvedValue({ state: "reserved" }),
    commit: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const anonymousQuota = anonymousUsage ?? {
    reserve: vi.fn().mockResolvedValue({ state: "reserved", usage: {} }),
    commit: vi.fn().mockResolvedValue({}),
    release: vi.fn().mockResolvedValue(undefined),
  };
  return {
    service: new IdeaSubmissionService(
      search,
      repository,
      evaluation,
      anonymousQuota as AnonymousUsageService,
      goodIdeas,
      planQuota as PlanUsageService,
    ),
    search,
    repository,
    evaluation,
    goodIdeas,
    planUsage: planQuota,
    anonymousUsage: anonymousQuota,
  };
}

describe("IdeaSubmissionService", () => {
  it("uses the browser free quota for an authenticated user without Iluminado", async () => {
    const planUsage = {
      reserve: vi.fn(),
      reserveIfPlanActive: vi.fn().mockResolvedValue(null),
      commit: vi.fn(),
      release: vi.fn(),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
    };
    const {
      service,
      planUsage: planQuota,
      anonymousUsage,
    } = createDependencies({ kind: "no-match" }, EVALUATION_RESULT, planUsage);

    await service.submit(
      VALID_REQUEST,
      IDEMPOTENCY_KEY,
      "visitor-token",
      AUTHENTICATED_USER_ID,
    );

    expect(planQuota.reserveIfPlanActive).toHaveBeenCalledWith(
      AUTHENTICATED_USER_ID,
      "ideas",
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
    expect(anonymousUsage.reserve).toHaveBeenCalledWith(
      "visitor-token",
      "ideas",
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
    expect(anonymousUsage.commit).toHaveBeenCalledOnce();
    expect(planQuota.commit).not.toHaveBeenCalled();
  });

  it("attributes a newly rejected idea to the authenticated user", async () => {
    const { service, repository } = createDependencies();

    await service.submit(
      VALID_REQUEST,
      IDEMPOTENCY_KEY,
      undefined,
      AUTHENTICATED_USER_ID,
    );

    expect(repository.addToWorstIdeas).toHaveBeenCalledWith(
      SAFE_TITLE,
      EVALUATION_RESULT.score,
      EMBEDDING,
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      AUTHENTICATED_USER_ID,
    );
  });

  it("attributes a matched rejected idea to the authenticated user", async () => {
    const { service, repository } = createDependencies({
      kind: "match",
      ideaId: "idea-1",
      semanticTitle: SAFE_TITLE,
      similarity: 0.92,
      submissionCount: 23,
    });

    await service.submit(
      VALID_REQUEST,
      IDEMPOTENCY_KEY,
      undefined,
      AUTHENTICATED_USER_ID,
    );

    expect(repository.updateWorstIdea).toHaveBeenCalledWith(
      "idea-1",
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      AUTHENTICATED_USER_ID,
    );
  });

  it("checks similarity first, counts the match once and returns only safe public fields", async () => {
    const { service, search, repository, evaluation } = createDependencies({
      kind: "match",
      ideaId: "idea-1",
      semanticTitle: SAFE_TITLE,
      similarity: 0.92,
      submissionCount: 23,
    });

    await expect(
      service.submit(VALID_REQUEST, IDEMPOTENCY_KEY),
    ).resolves.toEqual({
      status: "similar_idea_match",
      safeTitle: SAFE_TITLE,
      submissionCount: 24,
    });

    expect(search.executeDetailed).toHaveBeenCalledWith({
      ideaText: IDEA_TEXT,
    });
    expect(repository.updateWorstIdea).toHaveBeenCalledWith(
      "idea-1",
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });

  it("consumes the authenticated Iluminado quota only after evaluation succeeds", async () => {
    const planUsage = {
      reserveIfPlanActive: vi.fn().mockResolvedValue({ state: "reserved" }),
      commit: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
    };
    const { service, evaluation } = createDependencies(
      { kind: "no-match" },
      PROMISING_EVALUATION_RESULT,
      planUsage,
    );

    await expect(
      service.submit(
        VALID_REQUEST,
        IDEMPOTENCY_KEY,
        undefined,
        "123e4567-e89b-42d3-a456-426614174000",
      ),
    ).resolves.toMatchObject({ status: "evaluated" });

    expect(planUsage.reserveIfPlanActive).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174000",
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );
    expect(planUsage.commit).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174000",
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
      expect.objectContaining({ status: "evaluated" }),
    );
    expect(evaluation.evaluate).toHaveBeenCalledOnce();
  });

  it("replays the same authenticated evaluation when the idempotency UUID casing changes", async () => {
    const cachedResponse = {
      status: "evaluated",
      result: PROMISING_EVALUATION_RESULT,
    };
    const planUsage = {
      reserveIfPlanActive: vi
        .fn()
        .mockResolvedValueOnce({ state: "reserved" })
        .mockResolvedValueOnce({ state: "cached", response: cachedResponse }),
      commit: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
    };
    const { service, evaluation } = createDependencies(
      { kind: "no-match" },
      PROMISING_EVALUATION_RESULT,
      planUsage,
    );
    const userId = "123e4567-e89b-42d3-a456-426614174000";

    await expect(
      service.submit(VALID_REQUEST, IDEMPOTENCY_KEY, undefined, userId),
    ).resolves.toEqual(cachedResponse);
    await expect(
      service.submit(
        VALID_REQUEST,
        UPPERCASE_IDEMPOTENCY_KEY,
        undefined,
        userId,
      ),
    ).resolves.toEqual(cachedResponse);

    expect(planUsage.reserveIfPlanActive).toHaveBeenNthCalledWith(
      1,
      userId,
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );
    expect(planUsage.reserveIfPlanActive).toHaveBeenNthCalledWith(
      2,
      userId,
      "ideas",
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );
    expect(evaluation.evaluate).toHaveBeenCalledOnce();
    expect(planUsage.commit).toHaveBeenCalledOnce();
  });

  it("releases the authenticated quota reservation after a transient evaluation failure", async () => {
    const transientFailure = new Error("evaluation unavailable");
    const planUsage = {
      reserveIfPlanActive: vi.fn().mockResolvedValue({ state: "reserved" }),
      commit: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    } as unknown as PlanUsageService & {
      reserveIfPlanActive: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      release: ReturnType<typeof vi.fn>;
    };
    const { service, evaluation } = createDependencies(
      { kind: "no-match" },
      transientFailure,
      planUsage,
    );
    vi.mocked(evaluation.evaluate).mockRejectedValue(transientFailure);

    await expect(
      service.submit(
        VALID_REQUEST,
        IDEMPOTENCY_KEY,
        undefined,
        "123e4567-e89b-42d3-a456-426614174000",
      ),
    ).rejects.toThrow(transientFailure);

    expect(planUsage.commit).not.toHaveBeenCalled();
    expect(planUsage.release).toHaveBeenCalledWith(
      "123e4567-e89b-42d3-a456-426614174000",
      "ideas",
      IDEMPOTENCY_HASH,
    );
  });

  it("shows a simulated >0.90 grasshopper match without evaluating and increments once", async () => {
    const { service, search, repository, evaluation } = createDependencies({
      kind: "match",
      ideaId: "grasshopper-idea",
      semanticTitle: "Tinder para saltamontes",
      similarity: 0.91,
      submissionCount: 1,
    });

    await expect(
      service.submit(
        { ideaText: GRASSHOPPER_PARAPHRASE, tone: "hard" },
        IDEMPOTENCY_KEY,
      ),
    ).resolves.toEqual({
      status: "similar_idea_match",
      safeTitle: "Tinder para saltamontes",
      submissionCount: 24,
    });

    expect(search.executeDetailed).toHaveBeenCalledWith({
      ideaText: GRASSHOPPER_PARAPHRASE,
    });
    expect(repository.updateWorstIdea).toHaveBeenCalledTimes(1);
    expect(repository.updateWorstIdea).toHaveBeenCalledWith(
      "grasshopper-idea",
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });

  it("evaluates a no-match idea and stores only a rejected safe title and embedding", async () => {
    const { service, repository, evaluation } = createDependencies();

    await expect(
      service.submit(VALID_REQUEST, IDEMPOTENCY_KEY),
    ).resolves.toMatchObject({
      status: "evaluated",
      result: EVALUATION_RESULT,
    });

    expect(evaluation.evaluate).toHaveBeenCalledWith(VALID_REQUEST);
    expect(repository.addToWorstIdeas).toHaveBeenCalledWith(
      SAFE_TITLE,
      EVALUATION_RESULT.score,
      EMBEDDING,
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it("does not add non-rejected results to the rejected-idea corpus", async () => {
    const approvedResult = {
      ...EVALUATION_RESULT,
      status: "SIN_BLOQUEO_EVIDENTE" as const,
      safeTitle: undefined,
    };
    const { service, repository } = createDependencies(
      { kind: "no-match" },
      approvedResult,
    );

    await service.submit(VALID_REQUEST, IDEMPOTENCY_KEY);

    expect(repository.addToWorstIdeas).not.toHaveBeenCalled();
  });

  it("stores a promising evaluation privately for the authenticated owner", async () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const { service, goodIdeas } = createDependencies(
      { kind: "no-match" },
      PROMISING_EVALUATION_RESULT,
    );

    await service.submit(VALID_REQUEST, IDEMPOTENCY_KEY, undefined, userId);

    expect(goodIdeas.saveGoodIdea).toHaveBeenCalledExactlyOnceWith(
      userId,
      IDEA_TEXT,
      IDEMPOTENCY_HASH,
      REQUEST_HASH,
    );
  });

  it("does not store a promising evaluation for an anonymous visitor", async () => {
    const { service, goodIdeas } = createDependencies(
      { kind: "no-match" },
      PROMISING_EVALUATION_RESULT,
    );

    await service.submit(VALID_REQUEST, IDEMPOTENCY_KEY);

    expect(goodIdeas.saveGoodIdea).not.toHaveBeenCalled();
  });

  it("rejects a reused idempotency key with a different promising idea", async () => {
    const { service, goodIdeas } = createDependencies(
      { kind: "no-match" },
      PROMISING_EVALUATION_RESULT,
    );
    vi.mocked(goodIdeas.saveGoodIdea).mockResolvedValue(false);

    await expect(
      service.submit(
        VALID_REQUEST,
        IDEMPOTENCY_KEY,
        undefined,
        "00000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("fails closed without exposing idea text when approved idea storage fails", async () => {
    const privateIdea = `${IDEA_TEXT} contiene información privada`;
    const loggerError = vi
      .spyOn((await import("@nestjs/common")).Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const { service, goodIdeas } = createDependencies(
      { kind: "no-match" },
      PROMISING_EVALUATION_RESULT,
    );
    vi.mocked(goodIdeas.saveGoodIdea).mockRejectedValue(new Error(privateIdea));

    await expect(
      service.submit(
        { ...VALID_REQUEST, ideaText: privateIdea },
        IDEMPOTENCY_KEY,
        undefined,
        "00000000-0000-4000-8000-000000000001",
      ),
    ).rejects.toMatchObject({
      response: {
        code: "APPROVED_IDEA_UNAVAILABLE",
        message: "No se ha podido guardar la idea en tu perfil ahora.",
      },
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(privateIdea);
  });

  it("fails closed when a rejected result has no safe public title", async () => {
    const loggerError = vi
      .spyOn((await import("@nestjs/common")).Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const resultWithoutTitle = { ...EVALUATION_RESULT, safeTitle: undefined };
    const { service, repository } = createDependencies(
      { kind: "no-match" },
      resultWithoutTitle,
    );

    await expect(
      service.submit(VALID_REQUEST, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({
      response: {
        code: "INVALID_REJECTION_TITLE",
        message: "No se ha podido guardar el resultado de la evaluación.",
      },
    });
    expect(repository.addToWorstIdeas).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      "IDEA_REJECTION_TITLE_UNAVAILABLE",
    );
  });

  it("maps similarity and persistence failures to generic responses without leaking details", async () => {
    const privateText = `${IDEA_TEXT} secret`;
    const loggerError = vi
      .spyOn((await import("@nestjs/common")).Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const similarityFailure = createDependencies();
    vi.mocked(similarityFailure.search.executeDetailed).mockRejectedValue(
      new Error(privateText),
    );

    await expect(
      similarityFailure.service.submit(VALID_REQUEST, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({
      response: {
        code: "SIMILARITY_UNAVAILABLE",
        message: "No se ha podido comprobar la similitud ahora.",
      },
    });
    expect(similarityFailure.evaluation.evaluate).not.toHaveBeenCalled();

    const persistenceFailure = createDependencies();
    vi.mocked(persistenceFailure.repository.addToWorstIdeas).mockRejectedValue(
      new Error(privateText),
    );
    await expect(
      persistenceFailure.service.submit(VALID_REQUEST, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({
      response: {
        code: "INVALID_REJECTION_TITLE",
        message: "No se ha podido guardar el resultado de la evaluación.",
      },
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(privateText);
  });

  it("continues evaluation only when the same key has an unexpired prior match and does not count again", async () => {
    const { service, search, repository, evaluation } = createDependencies({
      kind: "no-match",
    });
    vi.mocked(repository.getIdempotentMatch).mockResolvedValue({
      id: "idea-1",
      safeTitle: SAFE_TITLE,
      count: 24,
    });

    await expect(
      service.submit(
        { ...VALID_REQUEST, continueAnyway: true },
        IDEMPOTENCY_KEY,
      ),
    ).resolves.toEqual({ status: "evaluated", result: EVALUATION_RESULT });

    expect(repository.getIdempotentMatch).toHaveBeenCalledWith(
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(repository.claimIdempotentContinuation).toHaveBeenCalledWith(
      IDEMPOTENCY_HASH,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(search.executeDetailed).not.toHaveBeenCalled();
    expect(repository.updateWorstIdea).not.toHaveBeenCalled();
    expect(repository.addToWorstIdeas).not.toHaveBeenCalled();
    expect(evaluation.evaluate).toHaveBeenCalledOnce();
  });

  it("rejects a key already bound to a different idea or tone", async () => {
    const { service, search, evaluation, repository } = createDependencies();
    vi.mocked(repository.hasDifferentIdempotentRequest).mockResolvedValue(true);

    await expect(
      service.submit(VALID_REQUEST, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({
      status: 409,
    });

    expect(search.executeDetailed).not.toHaveBeenCalled();
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });

  it("does not allow clients to skip the match check when continuing", async () => {
    const { service, evaluation } = createDependencies();

    await expect(
      service.submit(
        { ...VALID_REQUEST, continueAnyway: true },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });

  it("allows only one continuation for an idempotency key", async () => {
    const { service, repository, evaluation } = createDependencies();
    vi.mocked(repository.getIdempotentMatch).mockResolvedValue({
      id: "idea-1",
      safeTitle: SAFE_TITLE,
      count: 24,
    });
    vi.mocked(repository.claimIdempotentContinuation).mockResolvedValue(false);

    await expect(
      service.submit(
        { ...VALID_REQUEST, continueAnyway: true },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads and idempotency keys before calling dependencies", async () => {
    const { service, search, evaluation } = createDependencies();

    await expect(
      service.submit({ ...VALID_REQUEST, unexpected: true }, IDEMPOTENCY_KEY),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.submit(
        { ...VALID_REQUEST, userId: "00000000-0000-4000-8000-000000000001" },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.submit(VALID_REQUEST, "idea-key"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(search.executeDetailed).not.toHaveBeenCalled();
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });
});
