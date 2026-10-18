import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { RoastRankingRepository } from "./roast-ranking.models";
import { GetRoastRanking } from "./get-roast-ranking.service";

const RANKING = [
  { username: "GrumpyWinner", roastMessagesSent: 30 },
  { username: "TeaSpiller", roastMessagesSent: 21 },
];

function createService(
  repositoryOverride: Partial<RoastRankingRepository> = {},
) {
  const repository = {
    getRoastRanking: vi.fn().mockResolvedValue(RANKING),
    ...repositoryOverride,
  } as unknown as RoastRankingRepository;
  return {
    repository,
    service: new GetRoastRanking(repository),
  };
}

describe("GetRoastRanking", () => {
  it("returns the public roast ranking from the repository", async () => {
    const { repository, service } = createService();

    await expect(service.execute()).resolves.toEqual(RANKING);
    expect(repository.getRoastRanking).toHaveBeenCalledOnce();
  });

  it("returns a safe service error if the ranking cannot be read", async () => {
    const { service } = createService({
      getRoastRanking: vi.fn().mockRejectedValue(new Error("db failure")),
    });

    await expect(service.execute()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("rejects ranking entries with an unsafe avatar URL", async () => {
    const { service } = createService({
      getRoastRanking: vi.fn().mockResolvedValue([
        {
          username: "GrumpyWinner",
          roastMessagesSent: 30,
          avatarUrl: "https://evil.example/avatar.png",
        },
      ]),
    });

    await expect(service.execute()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
