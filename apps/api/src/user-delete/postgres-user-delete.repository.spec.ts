import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresUserDeleteRepository } from "./postgres-user-delete.repository";
import { LocalUserAvatarStorage } from "../user-avatar/local-user-avatar.storage";

const USER_ID = "ee1a4f52-678e-4b87-85f4-7782a92dddb4";

function createPool(userExists: boolean, failCommit = false) {
  const statements: string[] = [];
  let commitCount = 0;
  const client = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql.trim());
      if (sql.trim() === "COMMIT") commitCount += 1;
      if (failCommit && sql.trim() === "COMMIT" && commitCount > 1)
        throw new Error("commit failed");
      if (sql.includes("FROM users WHERE id"))
        return {
          rowCount: userExists ? 1 : 0,
          rows: userExists
            ? [
                {
                  id: USER_ID,
                  avatar_key: "00000000-0000-4000-8000-000000000001.webp",
                },
              ]
            : [],
        };
      if (sql.includes("DELETE FROM users"))
        return { rowCount: userExists ? 1 : 0, rows: [] };
      return { rowCount: 1, rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    end: vi.fn(),
    query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [] }),
  };
  return { pool, client, statements };
}

afterEach(() => vi.restoreAllMocks());

describe("PostgresUserDeleteRepository", () => {
  it("removes purchases, subscriptions and user in one transaction", async () => {
    const { pool, client, statements } = createPool(true);
    const repository = new PostgresUserDeleteRepository(pool as never);

    await expect(repository.deleteUser(USER_ID)).resolves.toBe(true);

    expect(statements.slice(statements.lastIndexOf("BEGIN"))).toEqual([
      "BEGIN",
      "SELECT id,avatar_key FROM users WHERE id=$1 FOR UPDATE",
      "DELETE FROM simulated_purchases WHERE user_id=$1",
      "DELETE FROM subscriptions WHERE user_id=$1",
      "DELETE FROM users WHERE id=$1",
      "COMMIT",
    ]);
    expect(client.query).toHaveBeenCalledWith("DELETE FROM users WHERE id=$1", [
      USER_ID,
    ]);
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it("does not mutate records when the account does not exist", async () => {
    const { pool, statements } = createPool(false);
    const repository = new PostgresUserDeleteRepository(pool as never);

    await expect(repository.deleteUser(USER_ID)).resolves.toBe(false);

    expect(statements.slice(statements.lastIndexOf("BEGIN"))).toEqual([
      "BEGIN",
      "SELECT id,avatar_key FROM users WHERE id=$1 FOR UPDATE",
      "COMMIT",
    ]);
  });

  it("restores the avatar file when the database transaction rolls back", async () => {
    const avatarBytes = Buffer.from("private avatar bytes");
    const read = vi
      .spyOn(LocalUserAvatarStorage.prototype, "read")
      .mockResolvedValue(avatarBytes);
    const remove = vi
      .spyOn(LocalUserAvatarStorage.prototype, "remove")
      .mockResolvedValue(undefined);
    const save = vi
      .spyOn(LocalUserAvatarStorage.prototype, "save")
      .mockResolvedValue(undefined);
    const { pool, statements } = createPool(true, true);
    const repository = new PostgresUserDeleteRepository(pool as never);

    await expect(repository.deleteUser(USER_ID)).rejects.toThrow(
      "commit failed",
    );

    expect(read).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001.webp",
    );
    expect(remove).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001.webp",
    );
    expect(save).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001.webp",
      avatarBytes,
    );
    expect(statements.slice(statements.lastIndexOf("BEGIN"))).toEqual([
      "BEGIN",
      "SELECT id,avatar_key FROM users WHERE id=$1 FOR UPDATE",
      "DELETE FROM simulated_purchases WHERE user_id=$1",
      "DELETE FROM subscriptions WHERE user_id=$1",
      "DELETE FROM users WHERE id=$1",
      "COMMIT",
      "ROLLBACK",
    ]);
  });
});
