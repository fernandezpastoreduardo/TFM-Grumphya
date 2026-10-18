import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GetBestListBestUsers } from "./get-best-list-best-users.service";
import type { BestUsersRepository } from "./best-users.models";

const USERS = [
  { username: "laura_critica", approvedIdeasCount: 18 },
  { username: "pablo_sin_pitch", approvedIdeasCount: 13 },
];

function createService(repositoryOverride: Partial<BestUsersRepository> = {}) {
  const repository = {
    getBestListBestUsers: vi.fn().mockResolvedValue(USERS),
    ...repositoryOverride,
  } as unknown as BestUsersRepository;
  return { repository, service: new GetBestListBestUsers(repository) };
}

describe("GetBestListBestUsers", () => {
  it("returns the public best-user list from the repository", async () => {
    const { repository, service } = createService();

    await expect(service.execute()).resolves.toEqual(USERS);
    expect(repository.getBestListBestUsers).toHaveBeenCalledOnce();
  });

  it("never returns more than ten users", async () => {
    const users = Array.from({ length: 12 }, (_, index) => ({
      username: `user-${index + 1}`,
      approvedIdeasCount: 12 - index,
    }));
    const { service } = createService({
      getBestListBestUsers: vi.fn().mockResolvedValue(users),
    });

    await expect(service.execute()).resolves.toEqual(users.slice(0, 10));
  });

  it("rejects malformed aliases and unsafe approval counts", async () => {
    const invalidUsers = [
      [{ username: "person@example.com", approvedIdeasCount: 4 }],
      [
        {
          username: "valid_alias",
          approvedIdeasCount: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
    ];

    for (const users of invalidUsers) {
      const { service } = createService({
        getBestListBestUsers: vi.fn().mockResolvedValue(users),
      });

      await expect(service.execute()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it("projects only the public alias and count fields", async () => {
    const users = [
      {
        username: "public_alias",
        approvedIdeasCount: 4,
        email: "private@example.com",
        userId: "private-id",
      },
    ];
    const { service } = createService({
      getBestListBestUsers: vi.fn().mockResolvedValue(users),
    });

    await expect(service.execute()).resolves.toEqual([
      { username: "public_alias", approvedIdeasCount: 4 },
    ]);
  });

  it("maps repository failures to a generic service error", async () => {
    const { service } = createService({
      getBestListBestUsers: vi.fn().mockRejectedValue(new Error("db failure")),
    });

    await expect(service.execute()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("rejects public user rows containing an unsafe avatar URL", async () => {
    const { service } = createService({
      getBestListBestUsers: vi.fn().mockResolvedValue([
        {
          username: "public_alias",
          approvedIdeasCount: 4,
          avatarUrl: "https://evil.example/avatar.png",
        },
      ]),
    });

    await expect(service.execute()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
