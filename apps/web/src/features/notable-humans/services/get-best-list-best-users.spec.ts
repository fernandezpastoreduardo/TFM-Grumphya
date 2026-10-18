import { afterEach, describe, expect, it, vi } from "vitest";
import { getBestListBestUsers } from "./get-best-list-best-users";

const USERS = [
  { username: "laura_critica", approvedIdeasCount: 18 },
  { username: "pablo_sin_pitch", approvedIdeasCount: 13 },
];

afterEach(() => vi.unstubAllGlobals());

describe("getBestListBestUsers", () => {
  it("loads and validates public usernames and approval counts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(USERS, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBestListBestUsers()).resolves.toEqual(USERS);
    expect(fetchMock).toHaveBeenCalledWith("/api/best-users", {
      signal: undefined,
      credentials: "omit",
    });
  });

  it("rejects more than ten users and invalid public DTOs", async () => {
    const tooManyUsers = Array.from({ length: 11 }, (_, index) => ({
      username: `user-${index}`,
      approvedIdeasCount: 11 - index,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(tooManyUsers)),
    );
    await expect(getBestListBestUsers()).rejects.toThrow();

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json([{ username: " ", approvedIdeasCount: -1 }]),
        ),
    );
    await expect(getBestListBestUsers()).rejects.toThrow();
  });

  it("accepts same-origin avatar URLs and rejects arbitrary image URLs", async () => {
    const avatarUrl = "/api/avatars/00000000-0000-4000-8000-000000000001.webp";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json([{ ...USERS[0], avatarUrl }])),
    );
    await expect(getBestListBestUsers()).resolves.toEqual([
      { ...USERS[0], avatarUrl },
    ]);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json([
            { ...USERS[0], avatarUrl: "https://evil.example/avatar.png" },
          ]),
        ),
    );
    await expect(getBestListBestUsers()).rejects.toThrow(
      "Best users response is invalid.",
    );
  });
});
