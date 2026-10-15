import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AnonymousUsageService } from "../manage-user-unknow/anonymous-usage.service";
import type { SearchSimilarIdea } from "../search-similar-idea/search-similar-idea";
import type { WorstIdeasRepository } from "../worst-ideas/worst-ideas.models";
import type { EvaluationProcessService } from "./evaluation-process.service";
import { IdeaSubmissionService } from "./idea-submission.service";

const IDEA = {
  ideaText: "Una app para compartir herramientas del barrio",
  tone: "soft" as const,
};
const IDEMPOTENCY_KEY = "d54e74e8-4d23-46d4-9944-0b39bcda0914";
const VISITOR_TOKEN = "opaque-cookie-token";
const REQUEST_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const EVALUATION_RESULT = {
  status: "SIN_BLOQUEO_EVIDENTE" as const,
  score: 7.4,
  headline: "Puede funcionar, si alguien se ocupa de lo básico.",
  message: "Falta aclarar cómo se reparte el coste de cada intercambio.",
};

function createService(searchResult: unknown = { kind: "no-match" }) {
  const search = {
    executeDetailed: vi
      .fn()
      .mockResolvedValue({ result: searchResult, embedding: [0.1] }),
  } as unknown as SearchSimilarIdea & {
    executeDetailed: ReturnType<typeof vi.fn>;
  };
  const repository = {
    hasDifferentIdempotentRequest: vi.fn().mockResolvedValue(false),
    getIdempotentMatch: vi.fn().mockResolvedValue(null),
    claimIdempotentContinuation: vi.fn().mockResolvedValue(true),
    addToWorstIdeas: vi.fn().mockResolvedValue("idea-id"),
    updateWorstIdea: vi.fn().mockResolvedValue(2),
  } as unknown as WorstIdeasRepository;
  const evaluation = {
    evaluate: vi.fn().mockResolvedValue(EVALUATION_RESULT),
  } as unknown as EvaluationProcessService;
  const usage = {
    reserve: vi.fn().mockResolvedValue({ state: "reserved", usage: {} }),
    commit: vi.fn().mockResolvedValue({}),
    release: vi.fn().mockResolvedValue(undefined),
  } as unknown as AnonymousUsageService & {
    reserve: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  return {
    service: new IdeaSubmissionService(search, repository, evaluation, usage),
    search,
    repository,
    evaluation,
    usage,
  };
}

describe("anonymous idea quota orchestration", () => {
  it("reserves before semantic search, then releases when the request is only a match notice", async () => {
    const { service, search, usage, evaluation } = createService({
      kind: "match",
      ideaId: "rejected-idea",
      semanticTitle: "Herramientas del barrio sin garantías de devolución",
      similarity: 0.93,
      submissionCount: 1,
    });

    await service.submit(IDEA, IDEMPOTENCY_KEY, VISITOR_TOKEN);

    expect(usage.reserve).toHaveBeenCalledWith(
      VISITOR_TOKEN,
      "ideas",
      createHash("sha256").update(IDEMPOTENCY_KEY).digest("hex"),
      expect.stringMatching(REQUEST_HASH_PATTERN),
    );
    expect(usage.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      search.executeDetailed.mock.invocationCallOrder[0]!,
    );
    expect(usage.release).toHaveBeenCalledTimes(1);
    expect(usage.commit).not.toHaveBeenCalled();
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });

  it("commits a valid no-match evaluation once and stores its idempotent response", async () => {
    const { service, usage, evaluation } = createService();
    const idempotencyHash = createHash("sha256")
      .update(IDEMPOTENCY_KEY)
      .digest("hex");

    const response = await service.submit(IDEA, IDEMPOTENCY_KEY, VISITOR_TOKEN);

    expect(evaluation.evaluate).toHaveBeenCalledTimes(1);
    expect(usage.commit).toHaveBeenCalledWith(
      VISITOR_TOKEN,
      "ideas",
      idempotencyHash,
      expect.stringMatching(REQUEST_HASH_PATTERN),
      response,
    );
    expect(usage.release).not.toHaveBeenCalled();
  });

  it("releases the reservation when evaluation fails so no lifetime use is charged", async () => {
    const { service, usage, evaluation, search } = createService();
    vi.mocked(evaluation.evaluate).mockRejectedValue(
      new Error("provider unavailable"),
    );

    await expect(
      service.submit(IDEA, IDEMPOTENCY_KEY, VISITOR_TOKEN),
    ).rejects.toThrow("provider unavailable");

    expect(search.executeDetailed).toHaveBeenCalledOnce();
    expect(usage.release).toHaveBeenCalledWith(
      VISITOR_TOKEN,
      "ideas",
      createHash("sha256").update(IDEMPOTENCY_KEY).digest("hex"),
    );
    expect(usage.commit).not.toHaveBeenCalled();
  });

  it("does not call similarity or evaluation when the idempotent evaluation response is cached", async () => {
    const cached = { status: "evaluated", result: EVALUATION_RESULT };
    const { service, search, usage, evaluation } = createService();
    usage.reserve.mockResolvedValue({
      state: "cached",
      response: cached,
      usage: {},
    });

    await expect(
      service.submit(IDEA, IDEMPOTENCY_KEY, VISITOR_TOKEN),
    ).resolves.toEqual(cached);
    expect(search.executeDetailed).not.toHaveBeenCalled();
    expect(evaluation.evaluate).not.toHaveBeenCalled();
  });

  it("reserves the continuation as one evaluation and commits a repeated rejection once", async () => {
    const { service, repository, usage, evaluation } = createService();
    (
      repository.getIdempotentMatch as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "rejected-idea",
      safeTitle: "Herramientas del barrio sin garantías de devolución",
      count: 2,
    });

    await service.submit(
      { ...IDEA, continueAnyway: true },
      IDEMPOTENCY_KEY,
      VISITOR_TOKEN,
    );

    expect(usage.reserve).toHaveBeenCalledWith(
      VISITOR_TOKEN,
      "ideas",
      createHash("sha256").update(IDEMPOTENCY_KEY).digest("hex"),
      expect.stringMatching(REQUEST_HASH_PATTERN),
    );
    expect(evaluation.evaluate).toHaveBeenCalledTimes(1);
    expect(usage.commit).toHaveBeenCalledTimes(1);
    expect(repository.updateWorstIdea).not.toHaveBeenCalled();
    expect(repository.addToWorstIdeas).not.toHaveBeenCalled();
  });
});
