import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { WorstIdeasRepository } from "./worst-ideas.models";
import { GetIdeaListWorstAll } from "./get-idea-list-worst-all.service";

const RANKING = [
  { safeTitle: "La red social de las tostadoras", weeklyCount: 7 },
];

function createService(repositoryOverride: Partial<WorstIdeasRepository> = {}) {
  const repository = {
    getIdeaListWorstAll: vi.fn().mockResolvedValue(RANKING),
    ...repositoryOverride,
  } as unknown as WorstIdeasRepository;
  return {
    repository,
    service: new GetIdeaListWorstAll(repository),
  };
}

describe("GetIdeaListWorstAll", () => {
  it("returns the public ranking from the repository", async () => {
    const { repository, service } = createService();

    await expect(service.execute()).resolves.toEqual(RANKING);
    expect(repository.getIdeaListWorstAll).toHaveBeenCalledOnce();
  });

  it("returns a safe service error if the ranking cannot be read", async () => {
    const { service } = createService({
      getIdeaListWorstAll: vi.fn().mockRejectedValue(new Error("db failure")),
    });

    await expect(service.execute()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
