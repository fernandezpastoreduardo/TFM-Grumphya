import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostgresPool } from "../infrastructure/database/postgres-pool";
import { runMigrations } from "../infrastructure/database/run-migrations";
import { PostgresUserAvatarRepository } from "./postgres-user-avatar.repository";

vi.mock("../infrastructure/database/postgres-pool", () => ({
  createPostgresPool: vi.fn(),
}));
vi.mock("../infrastructure/database/run-migrations", () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

const USER_ID = "123e4567-e89b-42d3-a456-426614174000";
const AVATAR_KEY = "avatars/user-hash.webp";

function setupRepository(query: ReturnType<typeof vi.fn>) {
  const pool = { query } as unknown as Pool;
  vi.mocked(createPostgresPool).mockReturnValue(pool);
  return {
    pool,
    repository: new PostgresUserAvatarRepository(),
  };
}

afterEach(() => vi.clearAllMocks());

describe("PostgresUserAvatarRepository", () => {
  it("replaces the avatar for an active user and returns the prior key", async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ avatar_key: "avatars/previous.webp" }],
    });
    const { pool, repository } = setupRepository(query);

    await expect(repository.replaceAvatar(USER_ID, AVATAR_KEY)).resolves.toBe(
      "avatars/previous.webp",
    );

    expect(createPostgresPool).toHaveBeenCalledOnce();
    expect(runMigrations).toHaveBeenCalledWith(pool);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), [
      USER_ID,
      AVATAR_KEY,
    ]);
  });

  it("returns null when an active user has no previous avatar", async () => {
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [{ avatar_key: null }],
    });
    const { repository } = setupRepository(query);

    await expect(
      repository.replaceAvatar(USER_ID, AVATAR_KEY),
    ).resolves.toBeNull();
  });

  it("rejects when the account is no longer active", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const { repository } = setupRepository(query);

    await expect(repository.replaceAvatar(USER_ID, AVATAR_KEY)).rejects.toThrow(
      "Active account not found.",
    );
  });

  it("runs migrations once and propagates migration failure before querying", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ avatar_key: null }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ avatar_key: AVATAR_KEY }],
      });
    const { pool, repository } = setupRepository(query);

    await repository.replaceAvatar(USER_ID, AVATAR_KEY);
    await repository.replaceAvatar(USER_ID, AVATAR_KEY);

    expect(runMigrations).toHaveBeenCalledOnce();

    const migrationFailure = new Error("migration failed");
    vi.mocked(runMigrations).mockRejectedValueOnce(migrationFailure);
    const failingRepository = new PostgresUserAvatarRepository();

    await expect(
      failingRepository.replaceAvatar(USER_ID, AVATAR_KEY),
    ).rejects.toBe(migrationFailure);
    expect(query).toHaveBeenCalledTimes(2);
    expect(runMigrations).toHaveBeenLastCalledWith(pool);
  });
});
