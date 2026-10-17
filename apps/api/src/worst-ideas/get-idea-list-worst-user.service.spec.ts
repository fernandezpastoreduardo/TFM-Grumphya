import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { WorstIdeasRepository } from "./worst-ideas.models";
import { GetIdeaListWorstUser } from "./get-idea-list-worst-user.service";

const USER_ID = "d25dc4df-0000-4000-8000-000000000001";
const ITEMS = [
  { safeTitle: "La red social de las tostadoras", count: 5 },
  { safeTitle: "Una suscripción a los lunes", count: 2 },
];

function createService(repositoryOverride: Partial<WorstIdeasRepository> = {}) {
  const repository = {
    getIdeaListWorstUser: vi.fn().mockResolvedValue(ITEMS),
    ...repositoryOverride,
  } as unknown as WorstIdeasRepository;
  return { repository, service: new GetIdeaListWorstUser(repository) };
}

describe("GetIdeaListWorstUser", () => {
  it("returns only the authenticated user's safe titles and submission counts", async () => {
    const { repository, service } = createService();

    await expect(service.execute(USER_ID)).resolves.toEqual(ITEMS);
    expect(repository.getIdeaListWorstUser).toHaveBeenCalledWith(USER_ID);
  });

  it("does not query the repository for an invalid user identifier", async () => {
    const { repository, service } = createService();

    await expect(service.execute("not-a-uuid")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.getIdeaListWorstUser).not.toHaveBeenCalled();
  });

  it("maps persistence errors to a safe service error", async () => {
    const { service } = createService({
      getIdeaListWorstUser: vi.fn().mockRejectedValue(new Error("db failure")),
    });

    await expect(service.execute(USER_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
