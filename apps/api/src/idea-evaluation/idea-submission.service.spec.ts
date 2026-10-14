import { ConflictException, BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SearchSimilarIdea } from "../search-similar-idea/search-similar-idea";
import type { WorstIdeasRepository } from "../worst-ideas/worst-ideas.models";
import type { EvaluationProcessService } from "./evaluation-process.service";
import { IdeaSubmissionService } from "./idea-submission.service";

const IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const GRASSHOPPER_PARAPHRASE =
  "hacer un tinder pero en lugar de para personas para saltamontes";
const IDEMPOTENCY_KEY = "d54e74e8-4d23-46d4-9944-0b39bcda0914";
const SAFE_TITLE = "Coordinación sin salvaguardas verificables";
const EVALUATION_RESULT = {
  status: "RECHAZADA" as const,
  score: 1.3,
  headline: "Vaya, justo falla donde más importa.",
  message:
    "Acceder sin permiso a datos convierte el servicio en una invasión directa de la privacidad de sus usuarios.",
  safeTitle: SAFE_TITLE,
};
const VALID_REQUEST = { ideaText: IDEA_TEXT, tone: "soft" as const };
const EMBEDDING = [0.1, 0.2, 0.3];
const IDEMPOTENCY_HASH = createHash("sha256")
  .update(IDEMPOTENCY_KEY)
  .digest("hex");

function createDependencies(
  searchResult: unknown = { kind: "no-match" },
  evaluationResult: unknown = EVALUATION_RESULT,
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
  } as unknown as WorstIdeasRepository;
  const evaluation = {
    evaluate: vi.fn().mockResolvedValue(evaluationResult),
  } as unknown as EvaluationProcessService;
  return {
    service: new IdeaSubmissionService(search, repository, evaluation),
    search,
    repository,
    evaluation,
  };
}

describe("IdeaSubmissionService", () => {
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
    );
    expect(evaluation.evaluate).not.toHaveBeenCalled();
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
      EMBEDDING,
      IDEMPOTENCY_HASH,
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
    );
    expect(repository.claimIdempotentContinuation).toHaveBeenCalledWith(
      IDEMPOTENCY_HASH,
    );
    expect(search.executeDetailed).not.toHaveBeenCalled();
    expect(repository.updateWorstIdea).not.toHaveBeenCalled();
    expect(repository.addToWorstIdeas).not.toHaveBeenCalled();
    expect(evaluation.evaluate).toHaveBeenCalledOnce();
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
      service.submit(VALID_REQUEST, "idea-key"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(search.executeDetailed).not.toHaveBeenCalled();
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });
});
