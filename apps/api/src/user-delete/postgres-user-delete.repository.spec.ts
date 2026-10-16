import { describe, expect, it, vi } from "vitest";
import { PostgresUserDeleteRepository } from "./postgres-user-delete.repository";

const USER_ID = "ee1a4f52-678e-4b87-85f4-7782a92dddb4";

function createPool(userExists: boolean) {
  const statements: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql.trim());
      if (sql.includes("FROM users WHERE id"))
        return {
          rowCount: userExists ? 1 : 0,
          rows: userExists ? [{ id: USER_ID }] : [],
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

describe("PostgresUserDeleteRepository", () => {
  it("removes purchases, subscriptions and user in one transaction", async () => {
    const { pool, client, statements } = createPool(true);
    const repository = new PostgresUserDeleteRepository(pool as never);

    await expect(repository.deleteUser(USER_ID)).resolves.toBe(true);

    expect(statements.slice(statements.lastIndexOf("BEGIN"))).toEqual([
      "BEGIN",
      "SELECT id FROM users WHERE id=$1 FOR UPDATE",
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
      "SELECT id FROM users WHERE id=$1 FOR UPDATE",
      "COMMIT",
    ]);
  });
});
