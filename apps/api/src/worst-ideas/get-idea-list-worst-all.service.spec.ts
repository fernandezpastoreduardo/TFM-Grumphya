import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { WorstIdeasRepository } from "./worst-ideas.models";
import { GetIdeaListWorstAll } from "./get-idea-list-worst-all.service";

const RANKING = [
  { safeTitle: "La red social de las tostadoras", weeklyCount: 7 },
];
const ALL_TIME_RANKING = [
  { safeTitle: "La red social de las tostadoras", count: 17 },
];

function createService(repositoryOverride: Partial<WorstIdeasRepository> = {}) {
  const repository = {
    getIdeaListWorstAll: vi.fn().mockResolvedValue(RANKING),
    getIdeaListWorstAllTime: vi.fn().mockResolvedValue(ALL_TIME_RANKING),
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

  it("returns no more than ten ranking items", async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      safeTitle: `Idea ${index + 1}`,
      weeklyCount: 12 - index,
    }));
    const { service } = createService({
      getIdeaListWorstAll: vi.fn().mockResolvedValue(items),
    });

    await expect(service.execute()).resolves.toEqual(items.slice(0, 10));
  });

  it("returns a safe service error if the ranking cannot be read", async () => {
    const { service } = createService({
      getIdeaListWorstAll: vi.fn().mockRejectedValue(new Error("db failure")),
    });

    await expect(service.execute()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("returns the all-time ranking from the repository", async () => {
    const { repository, service } = createService();

    await expect(service.executeAllTime()).resolves.toEqual(ALL_TIME_RANKING);
    expect(repository.getIdeaListWorstAllTime).toHaveBeenCalledOnce();
  });

  it("limits the all-time ranking to ten items", async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      safeTitle: `Idea ${index + 1}`,
      count: 12 - index,
    }));
    const { service } = createService({
      getIdeaListWorstAllTime: vi.fn().mockResolvedValue(items),
    });

    await expect(service.executeAllTime()).resolves.toEqual(items.slice(0, 10));
  });

  it("returns a safe service error if the all-time ranking cannot be read", async () => {
    const { service } = createService({
      getIdeaListWorstAllTime: vi
        .fn()
        .mockRejectedValue(new Error("db failure")),
    });

    await expect(service.executeAllTime()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
